namespace AlbionProfitChecker.Services;

public abstract class Photon18Parser
{
    private const int PhotonHeaderLength = 12;
    private const int CommandHeaderLength = 12;
    private const int FragmentHeaderLength = 20;
    private const byte CommandDisconnect = 4;
    private const byte CommandSendReliable = 6;
    private const byte CommandSendUnreliable = 7;
    private const byte CommandSendFragment = 8;
    private const byte MessageRequest = 2;
    private const byte MessageResponse = 3;
    private const byte MessageResponseAlternative = 7;
    private const byte MessageEvent = 4;
    private const byte MessageEncrypted = 131;
    private const int MaxSegmentLength = 4 * 1024 * 1024;
    private const int MaxPendingSegments = 32;

    private readonly Dictionary<int, SegmentedPacket> _pendingSegments = new();

    public bool ReceivePacket(byte[] payload)
    {
        if (payload is null || payload.Length < PhotonHeaderLength)
            return false;

        try
        {
            var input = new Protocol18Reader(payload);
            input.Skip(2);
            var flags = input.ReadByte();
            var commandCount = input.ReadByte();
            input.Skip(8);

            if (flags == 1)
                return false;

            for (var index = 0; index < commandCount; index++)
            {
                if (!HandleCommand(input))
                    return false;
            }

            return true;
        }
        catch (EndOfStreamException)
        {
            return false;
        }
        catch (InvalidDataException)
        {
            return false;
        }
        catch (OverflowException)
        {
            return false;
        }
    }

    protected abstract void OnRequest(byte operationCode, Dictionary<byte, object> parameters);

    protected abstract void OnResponse(
        byte operationCode,
        short returnCode,
        string debugMessage,
        Dictionary<byte, object> parameters);

    protected abstract void OnEvent(byte code, Dictionary<byte, object> parameters);

    private bool HandleCommand(Protocol18Reader input)
    {
        var commandType = input.ReadByte();
        input.Skip(3);
        var commandLength = checked((int)input.ReadUInt32BigEndian());
        input.Skip(4);

        var bodyLength = commandLength - CommandHeaderLength;
        if (bodyLength < 0 || bodyLength > input.Remaining)
            return false;

        var body = input.ReadBytes(bodyLength);
        var bodyReader = new Protocol18Reader(body);
        return commandType switch
        {
            CommandDisconnect => true,
            CommandSendReliable => HandleReliable(bodyReader),
            CommandSendUnreliable => HandleUnreliable(bodyReader),
            CommandSendFragment => HandleFragment(bodyReader),
            _ => true
        };
    }

    private bool HandleUnreliable(Protocol18Reader input)
    {
        if (input.Remaining < sizeof(int))
            return false;
        input.Skip(sizeof(int));
        return HandleReliable(input);
    }

    private bool HandleReliable(Protocol18Reader input)
    {
        if (input.Remaining < 2)
            return false;

        input.Skip(1);
        var messageType = input.ReadByte();
        if (messageType == MessageEncrypted)
            return true;

        switch (messageType)
        {
            case MessageRequest:
                OnRequest(ReadOperationCode(input), Protocol18Deserializer.DeserializeParameterTable(input));
                return true;
            case MessageResponse:
            case MessageResponseAlternative:
                var response = Protocol18Deserializer.DeserializeOperationResponse(input);
                OnResponse(response.OperationCode, response.ReturnCode, response.DebugMessage, response.Parameters);
                return true;
            case MessageEvent:
                OnEvent(ReadOperationCode(input), Protocol18Deserializer.DeserializeParameterTable(input));
                return true;
            default:
                return true;
        }
    }

    private bool HandleFragment(Protocol18Reader input)
    {
        if (input.Remaining < FragmentHeaderLength)
            return false;

        var sequence = checked((int)input.ReadUInt32BigEndian());
        _ = input.ReadUInt32BigEndian();
        _ = input.ReadUInt32BigEndian();
        var totalLengthValue = input.ReadUInt32BigEndian();
        var fragmentOffsetValue = input.ReadUInt32BigEndian();
        var fragment = input.ReadBytes(input.Remaining);

        if (totalLengthValue == 0 || totalLengthValue > MaxSegmentLength || fragmentOffsetValue > totalLengthValue)
        {
            _pendingSegments.Remove(sequence);
            return false;
        }

        var totalLength = checked((int)totalLengthValue);
        var fragmentOffset = checked((int)fragmentOffsetValue);
        if (fragment.Length > totalLength - fragmentOffset)
        {
            _pendingSegments.Remove(sequence);
            return false;
        }

        if (!_pendingSegments.TryGetValue(sequence, out var segmented) || segmented.TotalLength != totalLength)
        {
            if (_pendingSegments.Count >= MaxPendingSegments)
                return false;

            segmented = new SegmentedPacket(checked((int)totalLength));
            _pendingSegments[sequence] = segmented;
        }

        var fragmentStart = fragmentOffset;
        var fragmentEnd = checked(fragmentStart + fragment.Length);
        Buffer.BlockCopy(fragment, 0, segmented.Payload, fragmentStart, fragment.Length);
        for (var index = fragmentStart; index < fragmentEnd; index++)
        {
            if (segmented.Received[index]) continue;
            segmented.Received[index] = true;
            segmented.ReceivedCount++;
        }

        if (segmented.ReceivedCount != segmented.TotalLength)
            return true;

        _pendingSegments.Remove(sequence);
        return HandleReliable(new Protocol18Reader(segmented.Payload));
    }

    private static byte ReadOperationCode(Protocol18Reader input)
        => input.ReadByte();

    private sealed class SegmentedPacket
    {
        public SegmentedPacket(int totalLength)
        {
            TotalLength = totalLength;
            Payload = new byte[totalLength];
            Received = new bool[totalLength];
        }

        public int TotalLength { get; }
        public byte[] Payload { get; }
        public bool[] Received { get; }
        public int ReceivedCount { get; set; }
    }
}
