class Timestamp implements Comparable<Timestamp> {
  const Timestamp._(this._dateTime);

  final DateTime _dateTime;

  factory Timestamp.fromDate(DateTime dateTime) {
    return Timestamp._(dateTime.toUtc());
  }

  factory Timestamp.fromMillisecondsSinceEpoch(int milliseconds) {
    return Timestamp._(
      DateTime.fromMillisecondsSinceEpoch(milliseconds, isUtc: true),
    );
  }

  factory Timestamp.fromJson(Object? value) {
    return tryParse(value) ?? now();
  }

  static Timestamp now() => Timestamp._(DateTime.now().toUtc());

  static Timestamp? tryParse(Object? value) {
    if (value == null) return null;
    if (value is Timestamp) return value;
    if (value is DateTime) return Timestamp.fromDate(value);
    if (value is int) return Timestamp.fromMillisecondsSinceEpoch(value);
    if (value is num) {
      return Timestamp.fromMillisecondsSinceEpoch(value.toInt());
    }
    if (value is String && value.isNotEmpty) {
      return Timestamp.fromDate(DateTime.parse(value));
    }
    if (value is Map) {
      final seconds = value['_seconds'] ?? value['seconds'];
      final nanos = value['_nanoseconds'] ?? value['nanoseconds'] ?? 0;
      if (seconds is num) {
        final millis =
            seconds.toInt() * 1000 + ((nanos as num).toInt() ~/ 1000000);
        return Timestamp.fromMillisecondsSinceEpoch(millis);
      }
    }
    final dynamicValue = value as dynamic;
    try {
      final date = dynamicValue.toDate();
      if (date is DateTime) return Timestamp.fromDate(date);
    } catch (_) {
      // Not a Firestore-like timestamp.
    }
    return null;
  }

  DateTime toDate() => _dateTime.toLocal();

  int get millisecondsSinceEpoch => _dateTime.millisecondsSinceEpoch;

  String toIso8601String() => _dateTime.toIso8601String();

  String toJson() => toIso8601String();

  @override
  int compareTo(Timestamp other) => _dateTime.compareTo(other._dateTime);
}
