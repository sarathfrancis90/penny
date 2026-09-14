package ca.penny.offline

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun PennyApp(vm: PennyViewModel = viewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val largeText=androidx.compose.ui.platform.LocalDensity.current.fontScale>=1.6f
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val listState=androidx.compose.foundation.lazy.rememberLazyListState()
    LaunchedEffect(tab) {listState.scrollToItem(0)}
    var editor by rememberSaveable { mutableStateOf(false) }
    var editId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Expense?>(null) }
    var viewingReceipt by remember { mutableStateOf<Attachment?>(null) }
    var deletingReceipt by remember { mutableStateOf<Attachment?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    // Recovery secrets deliberately do not enter saved instance state.
    var backupKey by remember { mutableStateOf("") }
    var restoreKey by remember { mutableStateOf("") }
    var showBackup by remember { mutableStateOf(false) }
    var showCamera by remember { mutableStateOf(false) }
    var showOcr by remember { mutableStateOf(false) }
    var showRestore by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { it?.let(vm::scan) }
    val saveBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        uri?.let { vm.export(it, backupKey) }; backupKey = ""; showBackup = false
    }
    val openBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { vm.preview(it, restoreKey) }; restoreKey = ""; showRestore = false
    }
    LaunchedEffect(state.receipt) { if (state.receipt != null && !editor) { editId = null; editor = true } }
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(state.message) { state.message?.let { snack.showSnackbar(it); vm.clearMessage() } }
    Scaffold(snackbarHost = { SnackbarHost(snack) }, bottomBar = {
        val titles=listOf("Overview", "Expenses", "Finance", "Your vault")
        @Composable fun RowScope.entry(index:Int) {
                NavigationBarItem(selected = tab == index, onClick = { tab = index },
                    icon = { Icon(androidx.compose.ui.res.painterResource(listOf(R.drawable.ic_overview,R.drawable.ic_expenses,R.drawable.ic_finance,R.drawable.ic_vault)[index]),contentDescription=null) }, label = { Text(titles[index],maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis) })
        }
        if(largeText) {
            Surface(color=MaterialTheme.colorScheme.surface) {Column(Modifier.navigationBarsPadding()) {
                for(first in listOf(0,2)) Row(Modifier.fillMaxWidth().heightIn(min=80.dp)) {entry(first);entry(first+1)}
            }}
        } else NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
            titles.indices.forEach {entry(it)}
        }
    }, floatingActionButton = {
        if (tab < 2 && state.ready && !largeText) ExtendedFloatingActionButton(onClick = { if (!state.busy) { editId = null; editor = true } },
            containerColor = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
            icon = { Icon(androidx.compose.ui.res.painterResource(R.drawable.ic_add),contentDescription=null) }, text = { Text("Add expense") })
    }) { padding ->
        if(tab == 2) Box(Modifier.fillMaxSize().padding(padding),contentAlignment=Alignment.TopCenter) {FinanceScreen(state,vm,Modifier.widthIn(max=760.dp))} else Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 760.dp).fillMaxSize().testTag("vault-list"), state=listState, contentPadding = PaddingValues(24.dp, 20.dp, 24.dp, 100.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                item {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement=Arrangement.spacedBy(12.dp)) {
                        Text("penny", style = MaterialTheme.typography.headlineLarge)
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(50)) { Text("●  On this device", Modifier.padding(12.dp, 8.dp), style = MaterialTheme.typography.labelMedium) }
                    }
                }
                if (!state.ready) item {
                    if (state.fatalError) Text("Your vault could not be opened. Your saved data has been preserved. Restart the app to retry; do not uninstall it.", color = MaterialTheme.colorScheme.error)
                    else CircularProgressIndicator()
                }
                if(tab<2 && state.ready && largeText) item {Button(onClick={editId=null;editor=true},enabled=!state.busy,modifier=Modifier.fillMaxWidth()) {Icon(androidx.compose.ui.res.painterResource(R.drawable.ic_add),null);Spacer(Modifier.width(8.dp));Text("Add expense")}}
                if (tab == 3) {
                    item { Text("Your money.\nYour space.", style = MaterialTheme.typography.headlineLarge) }
                    item { InfoCard("Private by design", "Expenses stay encrypted on this device. No Penny account or server connection is needed for your local records.") }
                    item { InfoCard("On-device intelligence", "Receipt text recognition is included and works offline.\n\n${state.nano.description}") }
                    item { InfoCard("Back up on your terms", "Save and verify an encrypted file in your Files app. If you choose a cloud document provider, that provider controls its upload. Private Drive backup below has a separate verification flow.") }
                    item { InfoCard("Vault capacity", "${state.expenses.size} of 10,000 expenses · ${state.attachments.size} of 100 receipts\n\n${android.text.format.Formatter.formatShortFileSize(androidx.compose.ui.platform.LocalContext.current,state.attachments.sumOf {it.byteCount})} of 8 MiB receipt storage. Each saved JPEG or PNG can use up to 2 MiB.\n\nThe complete snapshot must fit 15 MiB before encryption and a 20 MiB backup file. Text and finance records also use this space. Export and verify a backup before reaching a limit; Penny will refuse additional records that exceed it.") }
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { vm.prepareBackup { backupKey = it; showBackup = true } }, enabled = state.ready && !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Create encrypted backup") }
                            OutlinedButton(onClick = { showRestore = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Restore a backup") }
                            Text("Until you create a backup, losing this device or uninstalling Penny loses your expenses.", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    item { DrivePanel(vm) }
                } else {
                    if (tab == 0) {
                        val month = YearMonth.now().toString()
                        val monthly = state.expenses.filter { it.expenseDate.startsWith(month) }
                        item {
                            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(32.dp)) {
                                Column(Modifier.fillMaxWidth().padding(26.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                    Text(LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM yyyy")).uppercase(), style = MaterialTheme.typography.labelLarge)
                                    Text(Money.format(Money.total(monthly)), style = MaterialTheme.typography.displayMedium)
                                    Text("CAD · ${monthly.size} expenses this month", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                        item { OutlinedButton(onClick = { picker.launch("image/*") }, enabled = state.ready && !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Scan a receipt on this device") } }
                        if (monthly.isNotEmpty()) item {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("Where it went", style = MaterialTheme.typography.titleLarge)
                                monthly.groupBy { it.category }.mapValues { Money.total(it.value) }.entries.sortedByDescending { it.value }.take(3).forEach { (name, total) ->
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) { Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium); Text(Money.format(total), fontWeight = FontWeight.Medium) }
                                    LinearProgressIndicator(progress = { total.toFloat() / Money.total(monthly).toFloat() }, modifier = Modifier.fillMaxWidth())
                                }
                            }
                        }
                    }
                    item { Text(if (tab == 0) "Recent expenses" else "Your expenses", style = MaterialTheme.typography.headlineMedium) }
                    if (tab == 1) item { OutlinedTextField(search, { search = it }, label = { Text("Search merchant or category") }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
                    val filtered = state.expenses.filter { search.isBlank() || tab == 0 || it.merchant.contains(search, true) || it.category.contains(search, true) }
                    if (filtered.isEmpty() && state.ready) item { InfoCard(if (search.isNotBlank() && tab == 1) "No matching expenses" else "A fresh start", "Add your first expense. It is saved here instantly, even in airplane mode.") }
                    items(if (tab == 0) filtered.take(8) else filtered, key = { it.id }) { expense ->
                        Card(onClick = { editId = expense.id; editor = true }, enabled = !state.busy, shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.testTag("expense-${expense.id}")) {
                            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(expense.merchant, fontWeight = FontWeight.SemiBold)
                                    Text(expense.category, style = MaterialTheme.typography.bodySmall)
                                    Text(expense.expenseDate, style = MaterialTheme.typography.labelSmall)
                                }
                                Text(Money.format(expense.amountMinor), fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
                if (state.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            }
        }
    }
    if (editor) ExpenseEditor(state.expenses.firstOrNull { it.id == editId }, state, onDismiss = { editor = false; vm.consumeReceipt() },
        onSave = { vm.save(it) { editor = false; vm.consumeReceipt() } }, onDelete = { deleting = it }, onSuggest = vm::suggest, onLocale = vm::setReceiptLocale, onCamera = { showCamera = true }, onOcr = { showOcr = true },
        onAttach = { picker.launch("image/*") }, onViewReceipt = { viewingReceipt = it }, onDeleteReceipt = { deletingReceipt = it })
    viewingReceipt?.let { attachment ->
        val bitmap = remember(attachment.id) { runCatching { ReceiptImage.decode(attachment.bytes()) }.getOrNull() }
        DisposableEffect(bitmap) { onDispose { bitmap?.recycle() } }
        AlertDialog(onDismissRequest = { viewingReceipt = null }, title = { Text("Saved receipt") }, text = {
            if (bitmap == null) Text("This receipt could not be opened. The saved data has been preserved.")
            else Image(bitmap.asImageBitmap(), "Receipt image", Modifier.fillMaxWidth().heightIn(max = 460.dp))
        }, confirmButton = { TextButton(onClick = { viewingReceipt = null }) { Text("Done") } })
    }
    deletingReceipt?.let { attachment -> AlertDialog(onDismissRequest = { deletingReceipt = null }, title = { Text("Remove this receipt?") },
        text = { Text("The expense will stay in your vault. The receipt image will be removed from this device.") },
        confirmButton = { TextButton(onClick = { vm.deleteReceipt(attachment.id); deletingReceipt = null }) { Text("Remove receipt") } },
        dismissButton = { TextButton(onClick = { deletingReceipt = null }) { Text("Keep receipt") } }) }
    deleting?.let { expense -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("Delete this expense?") }, text = { Text("${expense.merchant} · ${Money.format(expense.amountMinor)} will be removed from this device.") },
        confirmButton = { TextButton(onClick = { vm.delete(expense); deleting = null; editor = false }) { Text("Delete expense") } }, dismissButton = { TextButton(onClick = { deleting = null }) { Text("Keep expense") } }) }
    if (showCamera) ReceiptCamera(onCaptured = { bitmap,rotation -> showCamera=false; vm.scanCamera(bitmap,rotation) },onDismiss={showCamera=false})
    if (showOcr) AlertDialog(onDismissRequest={showOcr=false},title={Text("Original OCR text")},text={
        androidx.compose.foundation.text.selection.SelectionContainer {
            Text(state.receipt?.sourceText.orEmpty().ifEmpty { "No text was read. The receipt image is still attached." },Modifier.heightIn(max=400.dp).verticalScroll(rememberScrollState()))
        }
    },confirmButton={TextButton(onClick={showOcr=false}) { Text("Done") }})
    if (showBackup) RecoveryDialog(backupKey,state.busy,onDismiss={showBackup=false;backupKey=""},onConfirm={ expected,entered,result ->
        vm.confirmBackup(expected,entered) { error -> if(error==null) { backupKey=expected.trim();saveBackup.launch("Penny-${LocalDate.now()}-${Wire.id()}.pennybackup") } else result(error) }
    })
    if (showRestore) AlertDialog(properties=androidx.compose.ui.window.DialogProperties(securePolicy=androidx.compose.ui.window.SecureFlagPolicy.SecureOn),onDismissRequest = { showRestore = false; restoreKey = "" }, title = { Text("Open an encrypted backup") }, text = {
        OutlinedTextField(restoreKey, { restoreKey = it }, visualTransformation=androidx.compose.ui.text.input.PasswordVisualTransformation(), label = { Text("Recovery key") }, supportingText = { Text("You will review the backup before replacing any data.") })
    }, confirmButton = { TextButton(onClick = { openBackup.launch(arrayOf("*/*")) }, enabled = runCatching { Backup.key(restoreKey) }.isSuccess) { Text("Choose backup file") } }, dismissButton = { TextButton(onClick = { showRestore = false; restoreKey = "" }) { Text("Cancel") } })
    state.restoreSummary?.let { preview -> AlertDialog(onDismissRequest = vm::cancelRestore, title = { Text("Replace this vault?") },
        text = { Text("This backup contains ${preview.counts.getValue("expenses")} expenses, ${preview.counts.getValue("attachments")} receipts, ${preview.counts.getValue("budgets")} budgets, ${preview.counts.getValue("incomeSources")} income sources, ${preview.counts.getValue("incomeEntries")} received payments, ${preview.counts.getValue("savingsGoals")} savings goals, ${preview.counts.getValue("savingsEntries")} contributions and ${preview.counts.getValue("recurringExpenses")} recurring templates. Expenses total ${Money.format(preview.expenseTotalMinor)}. It replaces all current vault data. Create a backup first to keep the current records.") },
        confirmButton = { TextButton(onClick = vm::restore, enabled = !state.busy) { Text("Replace with backup") } }, dismissButton = { TextButton(onClick = vm::cancelRestore) { Text("Cancel") } }) }
}

@Composable private fun InfoCard(title: String, body: String) {
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(body, style = MaterialTheme.typography.bodyMedium) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ExpenseEditor(expense: Expense?, state: VaultUiState, onDismiss: () -> Unit, onSave: (Expense) -> Unit, onDelete: (Expense) -> Unit, onSuggest: () -> Unit, onLocale: (String)->Unit, onCamera: ()->Unit, onOcr: ()->Unit,
    onAttach: () -> Unit, onViewReceipt: (Attachment) -> Unit, onDeleteReceipt: (Attachment) -> Unit) {
    val focus=androidx.compose.ui.platform.LocalFocusManager.current
    val keyboard=androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    var merchant by rememberSaveable(expense?.id) { mutableStateOf(expense?.merchant ?: state.receipt?.merchant.orEmpty()) }
    var amount by rememberSaveable(expense?.id) { mutableStateOf(expense?.let { Money.edit(it.amountMinor) } ?: state.receipt?.amount.orEmpty()) }
    var date by rememberSaveable(expense?.id) { mutableStateOf(expense?.expenseDate ?: LocalDate.now().toString()) }
    var category by rememberSaveable(expense?.id) { mutableStateOf(expense?.category ?: Categories.other) }
    var note by rememberSaveable(expense?.id) { mutableStateOf(expense?.note.orEmpty()) }
    var description by rememberSaveable(expense?.id) { mutableStateOf(expense?.description.orEmpty()) }
    var categoryOpen by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var lastDraft by remember { mutableStateOf<ReceiptDraft?>(null) }
    LaunchedEffect(state.receipt) {
        val draft=state.receipt
        if(expense==null && draft!=null) {
            if(merchant.isEmpty() || merchant == lastDraft?.merchant) merchant=draft.merchant.orEmpty()
            if(amount.isEmpty() || amount == lastDraft?.amount) amount=draft.amount
        }
        lastDraft=draft
    }
    LaunchedEffect(state.categorySuggestion) { state.categorySuggestion?.let { category = it } }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(Modifier.fillMaxWidth().imePadding().testTag("expense-editor"), contentPadding = PaddingValues(24.dp, 0.dp, 24.dp, 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text(if (expense == null) "A little expense.\nAll taken care of." else "Edit expense", style = MaterialTheme.typography.headlineMedium) }
            item {
                Text("Receipt language and number format",style=MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    listOf("en-CA" to "English · Canada","fr-CA" to "Français · Canada").forEach { (locale,label) ->
                        FilterChip(selected=state.receiptLocale==locale,onClick={onLocale(locale)},enabled=!state.busy,label={Text(label)})
                    }
                }
            }
            if (state.receipt != null) item {
                Text(if(state.receiptOptimized) "An optimized JPEG copy is attached. The original photo is unchanged. This exact copy is saved encrypted and included in backups." else "Receipt attached to this draft. Review every field; the exact image bytes are stored encrypted when you save.", style=MaterialTheme.typography.bodySmall)
                val preview = remember(state.receiptBytes) { state.receiptBytes?.let { runCatching { ReceiptImage.decode(it) }.getOrNull() } }
                DisposableEffect(preview) { onDispose { preview?.recycle() } }
                preview?.let { Image(it.asImageBitmap(),if(state.receiptOptimized) "Optimized receipt copy preview" else "Receipt draft preview",Modifier.fillMaxWidth().heightIn(max=180.dp)) }
                state.receipt.reasons.forEach { Text(ReceiptParser.reason(it),style=MaterialTheme.typography.bodySmall) }
                TextButton(onClick=onOcr) { Text("Review original OCR text") }
            }
            item { OutlinedTextField(merchant, { merchant = it }, label = { Text("Merchant") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("merchant")) }
            item { OutlinedTextField(amount, { amount = it }, label = { Text("Amount · CAD") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal,imeAction=androidx.compose.ui.text.input.ImeAction.Done), keyboardActions=androidx.compose.foundation.text.KeyboardActions(onDone={focus.clearFocus();keyboard?.hide()}), singleLine = true, modifier = Modifier.fillMaxWidth().testTag("amount")) }
            item { OutlinedTextField(date, { date = it }, label = { Text("Date · YYYY-MM-DD") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("date")) }
            item { OutlinedButton(onClick = { categoryOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(category) } }
            if (state.nano == NanoState.AVAILABLE && state.receipt != null) item { TextButton(onClick = onSuggest, enabled = !state.busy) { Text("Suggest category on this device") } }
            item { OutlinedTextField(note, { note = it }, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth(), maxLines = 4) }
            item { OutlinedTextField(description, { description = it }, label = { Text("Description (optional)") }, modifier = Modifier.fillMaxWidth(), maxLines = 4) }
            item { OutlinedButton(onClick=onCamera,enabled=!state.busy && state.receiptBytes==null,modifier=Modifier.fillMaxWidth()) { Text("Photograph receipt") } }
            item { OutlinedButton(onClick = onAttach, enabled = !state.busy && state.receiptBytes == null, modifier = Modifier.fillMaxWidth()) { Text("Attach receipt photo or file") } }
            items(state.attachments.filter { it.expenseId == expense?.id }, key = { it.id }) { receipt ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { onViewReceipt(receipt) }) { Text("View receipt") }
                    TextButton(onClick = { onDeleteReceipt(receipt) }, enabled = !state.busy) { Text("Remove receipt") }
                }
            }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            item { Button(onClick = {
                try {
                    val now = Wire.now()
                    onSave(Expense(id = expense?.id ?: Wire.id(), merchant = Wire.trim(merchant), amountMinor = Money.parse(amount), expenseDate = date,
                        category = category, note = note, description = description, recurringTemplateId = expense?.recurringTemplateId, recurringOccurrenceDate = expense?.recurringOccurrenceDate,
                        createdAt = expense?.createdAt ?: now, updatedAt = maxOf(expense?.createdAt ?: now, now)))
                } catch (e: Exception) { error = e.message ?: "Check the expense details" }
            }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("save-expense")) { Text("Save on this device") } }
            if (expense != null) item { TextButton(onClick = { onDelete(expense) }, modifier = Modifier.fillMaxWidth()) { Text("Delete expense", color = MaterialTheme.colorScheme.error) } }
        }
    }
    if (categoryOpen) AlertDialog(onDismissRequest = { categoryOpen = false }, title = { Text("Expense category") }, text = {
        LazyColumn { items(Categories.all) { value -> TextButton(onClick = { category = value; categoryOpen = false }, modifier = Modifier.fillMaxWidth()) { Text(value, Modifier.fillMaxWidth()) } } }
    }, confirmButton = { TextButton(onClick = { categoryOpen = false }) { Text("Done") } })
}
