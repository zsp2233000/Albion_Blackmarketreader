using System.Buffers.Binary;
using System.Collections;
using System.Text;

namespace AlbionProfitChecker.Services;

internal enum Protocol18Type : byte
{
    Unknown = 0,
    Boolean = 2,
    Byte = 3,
    Short = 4,
    Float = 5,
    Double = 6,
    String = 7,
    Null = 8,
    CompressedInt = 9,
    CompressedLong = 10,
    Int1 = 11,
    Int1Negative = 12,
    Int2 = 13,
    Int2Negative = 14,
    Long1 = 15,
    Long1Negative = 16,
    Long2 = 17,
    Long2Negative = 18,
    Custom = 19,
    Dictionary = 20,
    Hashtable = 21,
    ObjectArray = 23,
    OperationRequest = 24,
    OperationResponse = 25,
    EventData = 26,
    BooleanFalse = 27,
    BooleanTrue = 28,
    ShortZero = 29,
    IntZero = 30,
    LongZero = 31,
    FloatZero = 32,
    DoubleZero = 33,
    ByteZero = 34,
    Array = 64,
    BooleanArray = 66,
    ByteArray = 67,
    ShortArray = 68,
    FloatArray = 69,
    DoubleArray = 70,
    StringArray = 71,
    CompressedIntArray = 73,
    CompressedLongArray = 74,
    CustomTypeArray = 83,
    DictionaryArray = 84,
    HashtableArray = 85,
    CustomTypeSlim = 128
}

internal sealed class Protocol18Reader
{
    private readonly byte[] _buffer;

    public Protocol18Reader(byte[] buffer)
    {
        _buffer = buffer;
    }

    public int Position { get; private set; }

    public int Remaining => _buffer.Length - Position;

    public byte ReadByte()
    {
        EnsureAvailable(1);
        return _buffer[Position++];
    }

    public short ReadInt16LittleEndian()
    {
        EnsureAvailable(sizeof(short));
        var value = BinaryPrimitives.ReadInt16LittleEndian(_buffer.AsSpan(Position, sizeof(short)));
        Position += sizeof(short);
        return value;
    }

    public int ReadInt32LittleEndian()
    {
        EnsureAvailable(sizeof(int));
        var value = BinaryPrimitives.ReadInt32LittleEndian(_buffer.AsSpan(Position, sizeof(int)));
        Position += sizeof(int);
        return value;
    }

    public uint ReadUInt32BigEndian()
    {
        EnsureAvailable(sizeof(uint));
        var value = BinaryPrimitives.ReadUInt32BigEndian(_buffer.AsSpan(Position, sizeof(uint)));
        Position += sizeof(uint);
        return value;
    }

    public byte[] ReadBytes(int count)
    {
        if (count < 0) throw new InvalidDataException("Protocol18 byte count cannot be negative.");
        EnsureAvailable(count);
        var value = _buffer.AsSpan(Position, count).ToArray();
        Position += count;
        return value;
    }

    public void Skip(int count)
    {
        if (count < 0) throw new InvalidDataException("Protocol18 skip count cannot be negative.");
        EnsureAvailable(count);
        Position += count;
    }

    public uint ReadCompressedUInt32()
    {
        uint value = 0;
        var shift = 0;
        while (shift < 35)
        {
            var current = ReadByte();
            value |= (uint)(current & 0x7F) << shift;
            if ((current & 0x80) == 0) return value;
            shift += 7;
        }

        throw new InvalidDataException("Protocol18 compressed integer is too large.");
    }

    public ulong ReadCompressedUInt64()
    {
        ulong value = 0;
        var shift = 0;
        while (shift < 70)
        {
            var current = ReadByte();
            value |= (ulong)(current & 0x7F) << shift;
            if ((current & 0x80) == 0) return value;
            shift += 7;
        }

        throw new InvalidDataException("Protocol18 compressed long is too large.");
    }

    private void EnsureAvailable(int count)
    {
        if (count > Remaining)
            throw new EndOfStreamException("Protocol18 payload ended before the expected data was available.");
    }
}

internal sealed record Protocol18OperationResponse(
    byte OperationCode,
    short ReturnCode,
    string DebugMessage,
    Dictionary<byte, object> Parameters);

internal static class Protocol18Deserializer
{
    private const int MaxCollectionLength = 100_000;
    private const byte TypedArrayMask = 0x40;
    private const byte CustomTypeSlimMask = 0x80;

    public static Dictionary<byte, object> DeserializeParameterTable(Protocol18Reader input)
    {
        var count = ReadCollectionLength(input);
        var parameters = new Dictionary<byte, object>(count);
        for (var index = 0; index < count; index++)
        {
            var key = input.ReadByte();
            parameters[key] = Deserialize(input, input.ReadByte())!;
        }

        return parameters;
    }

    public static Protocol18OperationResponse DeserializeOperationResponse(Protocol18Reader input)
    {
        var operationCode = input.ReadByte();
        var returnCode = input.ReadInt16LittleEndian();
        var debugMessage = string.Empty;
        var parameters = new Dictionary<byte, object>();

        if (input.Remaining > 0)
        {
            var debugValue = Deserialize(input, input.ReadByte());
            if (debugValue is string text)
                debugMessage = text;
            else if (debugValue is string[] debugValues)
                parameters[0] = debugValues;
        }

        if (input.Remaining > 0)
        {
            foreach (var parameter in DeserializeParameterTable(input))
                parameters[parameter.Key] = parameter.Value;
        }

        return new Protocol18OperationResponse(operationCode, returnCode, debugMessage, parameters);
    }

    public static Dictionary<byte, object> DeserializeOperationRequest(Protocol18Reader input)
    {
        input.ReadByte();
        return DeserializeParameterTable(input);
    }

    public static Dictionary<byte, object> DeserializeEventData(Protocol18Reader input)
    {
        input.ReadByte();
        return DeserializeParameterTable(input);
    }

    private static object? Deserialize(Protocol18Reader input, byte typeCode)
    {
        if ((typeCode & CustomTypeSlimMask) != 0)
            return DeserializeCustom(input, typeCode, slim: true);

        if ((typeCode & TypedArrayMask) != 0)
        {
            var elementType = (byte)(typeCode & ~TypedArrayMask);
            return typeCode == (byte)Protocol18Type.Array
                ? DeserializeUntypedArray(input)
                : DeserializeTypedArray(input, elementType);
        }

        return (Protocol18Type)typeCode switch
        {
            Protocol18Type.Unknown or Protocol18Type.Null => null,
            Protocol18Type.Boolean => input.ReadByte() != 0,
            Protocol18Type.Byte => input.ReadByte(),
            Protocol18Type.Short => input.ReadInt16LittleEndian(),
            Protocol18Type.Float => BitConverter.Int32BitsToSingle(input.ReadInt32LittleEndian()),
            Protocol18Type.Double => BitConverter.Int64BitsToDouble(ReadInt64LittleEndian(input)),
            Protocol18Type.String => DeserializeString(input),
            Protocol18Type.CompressedInt => DecodeZigZag32(input.ReadCompressedUInt32()),
            Protocol18Type.CompressedLong => DecodeZigZag64(input.ReadCompressedUInt64()),
            Protocol18Type.Int1 => (int)input.ReadByte(),
            Protocol18Type.Int1Negative => -(int)input.ReadByte(),
            Protocol18Type.Int2 => ReadUInt16(input),
            Protocol18Type.Int2Negative => -(int)ReadUInt16(input),
            Protocol18Type.Long1 => (long)input.ReadByte(),
            Protocol18Type.Long1Negative => -(long)input.ReadByte(),
            Protocol18Type.Long2 => (long)ReadUInt16(input),
            Protocol18Type.Long2Negative => -(long)ReadUInt16(input),
            Protocol18Type.Custom => DeserializeCustom(input, typeCode, slim: false),
            Protocol18Type.Dictionary or Protocol18Type.Hashtable => DeserializeDictionary(input),
            Protocol18Type.ObjectArray => DeserializeObjectArray(input),
            Protocol18Type.OperationRequest => DeserializeOperationRequest(input),
            Protocol18Type.OperationResponse => DeserializeOperationResponse(input),
            Protocol18Type.EventData => DeserializeEventData(input),
            Protocol18Type.BooleanFalse => false,
            Protocol18Type.BooleanTrue => true,
            Protocol18Type.ShortZero => (short)0,
            Protocol18Type.IntZero => 0,
            Protocol18Type.LongZero => 0L,
            Protocol18Type.FloatZero => 0f,
            Protocol18Type.DoubleZero => 0d,
            Protocol18Type.ByteZero => (byte)0,
            _ => throw new InvalidDataException($"Protocol18 type code {typeCode} is not supported.")
        };
    }

    private static object[] DeserializeUntypedArray(Protocol18Reader input)
    {
        var count = ReadCollectionLength(input);
        var typeCode = input.ReadByte();
        var values = new object[count];
        for (var index = 0; index < count; index++)
            values[index] = Deserialize(input, typeCode)!;
        return values;
    }

    private static object DeserializeTypedArray(Protocol18Reader input, byte elementType)
    {
        var count = ReadCollectionLength(input);
        return (Protocol18Type)elementType switch
        {
            Protocol18Type.Boolean => DeserializeBooleanArray(input, count),
            Protocol18Type.Byte => input.ReadBytes(count),
            Protocol18Type.Short => DeserializeArray(input, count, static reader => reader.ReadInt16LittleEndian()),
            Protocol18Type.Float => DeserializeArray(input, count, static reader => BitConverter.Int32BitsToSingle(reader.ReadInt32LittleEndian())),
            Protocol18Type.Double => DeserializeArray(input, count, static reader => BitConverter.Int64BitsToDouble(ReadInt64LittleEndian(reader))),
            Protocol18Type.String => DeserializeArray(input, count, DeserializeString),
            Protocol18Type.CompressedInt => DeserializeArray(input, count, reader => DecodeZigZag32(reader.ReadCompressedUInt32())),
            Protocol18Type.CompressedLong => DeserializeArray(input, count, reader => DecodeZigZag64(reader.ReadCompressedUInt64())),
            Protocol18Type.Custom => DeserializeCustomArray(input, count),
            _ => DeserializeObjectArray(input, count, elementType)
        };
    }

    private static bool[] DeserializeBooleanArray(Protocol18Reader input, int count)
    {
        var values = new bool[count];
        var index = 0;
        while (index < count)
        {
            var packed = input.ReadByte();
            for (var bit = 0; bit < 8 && index < count; bit++)
            {
                values[index++] = (packed & (1 << bit)) != 0;
            }
        }

        return values;
    }

    private static T[] DeserializeArray<T>(Protocol18Reader input, int count, Func<Protocol18Reader, T> read)
    {
        var values = new T[count];
        for (var index = 0; index < count; index++)
            values[index] = read(input);
        return values;
    }

    private static object[] DeserializeObjectArray(Protocol18Reader input, int count, byte elementType)
    {
        var values = new object[count];
        for (var index = 0; index < count; index++)
            values[index] = Deserialize(input, elementType)!;
        return values;
    }

    private static byte[][] DeserializeCustomArray(Protocol18Reader input, int count)
    {
        input.ReadByte();
        var values = new byte[count][];
        for (var index = 0; index < count; index++)
            values[index] = input.ReadBytes(ReadCollectionLength(input));

        return values;
    }

    private static IDictionary DeserializeDictionary(Protocol18Reader input)
    {
        var keyType = input.ReadByte();
        var valueType = input.ReadByte();
        var count = ReadCollectionLength(input);
        var values = new Hashtable();
        for (var index = 0; index < count; index++)
        {
            var key = Deserialize(input, keyType == 0 ? input.ReadByte() : keyType);
            var value = Deserialize(input, valueType == 0 ? input.ReadByte() : valueType);
            if (key is not null)
                values[key] = value;
        }

        return values;
    }

    private static object[] DeserializeObjectArray(Protocol18Reader input)
    {
        var count = ReadCollectionLength(input);
        var values = new object[count];
        for (var index = 0; index < count; index++)
            values[index] = Deserialize(input, input.ReadByte())!;
        return values;
    }

    private static byte[] DeserializeCustom(Protocol18Reader input, byte typeCode, bool slim)
    {
        if (!slim) _ = input.ReadByte();
        _ = typeCode;
        return input.ReadBytes(ReadCollectionLength(input));
    }

    private static string DeserializeString(Protocol18Reader input)
    {
        var length = ReadCollectionLength(input);
        return Encoding.UTF8.GetString(input.ReadBytes(length));
    }

    private static int ReadCollectionLength(Protocol18Reader input)
    {
        var count = checked((int)input.ReadCompressedUInt32());
        if (count > MaxCollectionLength)
            throw new InvalidDataException($"Protocol18 collection length {count} exceeds the safety limit.");
        return count;
    }

    private static ushort ReadUInt16(Protocol18Reader input)
    {
        var low = input.ReadByte();
        var high = input.ReadByte();
        return (ushort)(low | high << 8);
    }

    private static long ReadInt64LittleEndian(Protocol18Reader input)
    {
        var low = (ulong)(uint)input.ReadInt32LittleEndian();
        var high = (ulong)(uint)input.ReadInt32LittleEndian();
        return unchecked((long)(low | high << 32));
    }

    private static int DecodeZigZag32(uint value)
        => unchecked((int)((value >> 1) ^ (uint)-(int)(value & 1)));

    private static long DecodeZigZag64(ulong value)
        => unchecked((long)((value >> 1) ^ (ulong)-(long)(value & 1)));
}
