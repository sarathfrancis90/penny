import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Top-level tabs of the app shell (see app_router.dart).
const shellTabRoutes = {'/', '/dashboard', '/finances', '/groups', '/profile'};

/// Where a notification should open. An invitation is for a group the user
/// has not joined yet, so its group page would refuse them; the Groups tab
/// lists it with Accept and Decline.
String linkForNotification({required String? type, required String url}) =>
    type == 'group_invitation' ? '/groups' : url;

/// Opens an in-app link from a notification.
///
/// Tabs live inside the app shell: pushing one as a new page puts a second
/// shell on the stack, which crashes on its duplicate keys, so tabs are
/// switched to instead.
void openAppLink(BuildContext context, String url) {
  final path = Uri.tryParse(url)?.path ?? url;
  if (shellTabRoutes.contains(path)) {
    context.go(path);
  } else {
    context.push(url);
  }
}
