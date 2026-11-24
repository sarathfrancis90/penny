import 'package:flutter_test/flutter_test.dart';
import 'package:penny_mobile/presentation/widgets/expense_card.dart';

void main() {
  test('saveAll runs every registered card, also after one fails', () async {
    final controller = ExpenseSaveController();
    addTearDown(controller.dispose);
    final ran = <String>[];
    Future<bool> Function() card(String name, {required bool ok}) => () async {
      ran.add(name);
      return ok;
    };
    controller
      ..register('a', card('a', ok: true))
      ..register('b', card('b', ok: false))
      ..register('c', card('c', ok: true));

    final states = <bool>[];
    controller.saving.addListener(() => states.add(controller.saving.value));
    final result = await controller.saveAll();

    expect(ran, ['a', 'b', 'c']);
    expect(result, (saved: 2, failed: 1));
    expect(states, [true, false]);
  });

  test('a second saveAll while one is running does nothing', () async {
    final controller = ExpenseSaveController();
    addTearDown(controller.dispose);
    var runs = 0;
    controller.register('a', () async {
      runs++;
      return true;
    });

    await Future.wait([controller.saveAll(), controller.saveAll()]);

    expect(runs, 1);
  });
}
