using System.Buffers.Binary;
using System.Runtime.InteropServices;

namespace AlbionProfitChecker.Services;

internal sealed class Photon18TcpStreamAssembler
{
    private const int PhotonHeaderLength = 12;
    private const int CommandHeaderLength = 12;
    private const int MaxCommandLength = 4 * 1024 * 1024;
    private const int MaxBufferedBytes = 8 * 1024 * 1024;
    private const int MaxPendingSegments = 64;

    private readonly List<byte> _buffer = new();
    private readonly SortedDictionary<uint, byte[]> _pendingSegments = new();
    private uint _nextSequence;
    private bool _hasSequence;

    public IReadOnlyList<byte[]> Append(uint sequenceNumber, byte[] payload)
    {
        if (payload is null || payload.Length == 0)
            return Array.Empty<byte[]>();

        if (!_hasSequence)
        {
            _nextSequence = sequenceNumber;
            _hasSequence = true;
        }

        if (IsBefore(sequenceNumber, _nextSequence))
        {
            var overlap = unchecked(_nextSequence - sequenceNumber);
            if (overlap >= payload.Length)
                return ExtractFrames();

            payload = payload[(int)overlap..];
            sequenceNumber = _nextSequence;
        }

        if (sequenceNumber != _nextSequence)
        {
            if (_pendingSegments.Count >= MaxPendingSegments)
                _pendingSegments.Clear();
            _pendingSegments.TryAdd(sequenceNumber, payload);
            return ExtractFrames();
        }

        AppendContiguous(payload);
        while (_pendingSegments.Remove(_nextSequence, out var nextPayload))
            AppendContiguous(nextPayload);

        return ExtractFrames();
    }

    private void AppendContiguous(byte[] payload)
    {
        if (payload.Length > MaxBufferedBytes - _buffer.Count)
        {
            _buffer.Clear();
            _pendingSegments.Clear();
        }

        _buffer.AddRange(payload);
        _nextSequence = unchecked(_nextSequence + (uint)payload.Length);
    }

    private IReadOnlyList<byte[]> ExtractFrames()
    {
        var frames = new List<byte[]>();
        while (TryGetFrameLength(_buffer, out var frameLength))
        {
            frames.Add(_buffer.GetRange(0, frameLength).ToArray());
            _buffer.RemoveRange(0, frameLength);
        }

        if (_buffer.Count > MaxBufferedBytes)
            _buffer.Clear();
        return frames;
    }

    private static bool TryGetFrameLength(List<byte> buffer, out int frameLength)
    {
        frameLength = 0;
        if (buffer.Count < PhotonHeaderLength)
            return false;

        var commandCount = buffer[3];
        var offset = PhotonHeaderLength;
        for (var index = 0; index < commandCount; index++)
        {
            if (buffer.Count < offset + CommandHeaderLength)
                return false;

            var commandLength = BinaryPrimitives.ReadUInt32BigEndian(CollectionsMarshal.AsSpan(buffer)[(offset + 4)..(offset + 8)]);
            if (commandLength < CommandHeaderLength || commandLength > MaxCommandLength)
            {
                buffer.RemoveAt(0);
                return false;
            }

            var nextOffset = checked(offset + (int)commandLength);
            if (nextOffset > buffer.Count)
                return false;
            offset = nextOffset;
        }

        frameLength = offset;
        return true;
    }

    private static bool IsBefore(uint left, uint right)
        => left != right && (int)(left - right) < 0;
}
