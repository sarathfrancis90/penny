import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the user is browsing as a guest (without an account).
/// Guest mode allows exploring the app UI to satisfy Apple Guideline 5.1.1(v).
final guestModeProvider = StateProvider<bool>((ref) => false);
