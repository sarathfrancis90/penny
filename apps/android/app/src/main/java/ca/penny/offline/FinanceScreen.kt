package ca.penny.offline

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import java.time.LocalDate
import java.time.YearMonth
import org.json.JSONObject

@Composable fun FinanceScreen(state: VaultUiState, vm: PennyViewModel, modifier: Modifier = Modifier) {
    var section by rememberSaveable { mutableStateOf("Reports") }
    var month by rememberSaveable { mutableStateOf(YearMonth.now().toString()) }
    var monthInput by rememberSaveable { mutableStateOf(month) }
    var enteringMonth by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var editor by remember { mutableStateOf<FinanceRecord?>(null) }
    var existing by remember { mutableStateOf(false) }
    var dueExpense by remember { mutableStateOf<FinanceMath.Due?>(null) }
    var deleting by remember { mutableStateOf<FinanceRecord?>(null) }
    var csvConfirm by remember { mutableStateOf(false) }
    val focus=LocalFocusManager.current
    val keyboard=LocalSoftwareKeyboardController.current
    val locale=androidx.compose.ui.platform.LocalLocale.current.platformLocale
    val chipScroll=rememberScrollState()
    LaunchedEffect(enteringMonth) {if(!enteringMonth) {focus.clearFocus();keyboard?.hide()}}
    LaunchedEffect(section) { if(section=="Reports") chipScroll.scrollTo(0) }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri -> uri?.let(vm::exportCsv) }
    val snapshot = remember(state.expenses,state.attachments,state.finance) { Snapshot("00000000-0000-4000-8000-000000000000",state.expenses,attachments=state.attachments,finance=state.finance) }
    val report = remember(snapshot,month) { FinanceMath.report(snapshot,month) }
    val dues = remember(snapshot,month) {
        val first = "$month-01"; val last = minOf(YearMonth.parse(month).atEndOfMonth().toString(),LocalDate.now().toString())
        if(first > last) emptyList() else FinanceMath.dues(snapshot,first,last)
    }
    fun edit(record: FinanceRecord, isExisting: Boolean = false) { editor=record; existing=isExisting }
    LazyColumn(modifier.fillMaxSize().testTag("finance-list"),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item { Text("Your finances",style=MaterialTheme.typography.headlineLarge) }
        item { Row(Modifier.horizontalScroll(chipScroll),horizontalArrangement=Arrangement.spacedBy(8.dp)) { listOf("Reports","Budgets","Income","Savings","Recurring").forEach { title -> FilterChip(section==title,{ section=title;focus.clearFocus();keyboard?.hide() },label={ Text(title) }) } } }
        item {
            Row(Modifier.fillMaxWidth(),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                IconButton(onClick={month=YearMonth.parse(month).minusMonths(1).toString();monthInput=month;error=null;focus.clearFocus();keyboard?.hide()},enabled=month>"0001-01") {Icon(androidx.compose.ui.res.painterResource(R.drawable.ic_previous),"Previous month")}
                Text(YearMonth.parse(month).format(java.time.format.DateTimeFormatter.ofPattern("LLLL uuuu",locale)),Modifier.weight(1f),textAlign=androidx.compose.ui.text.style.TextAlign.Center,style=MaterialTheme.typography.titleLarge)
                IconButton(onClick={month=YearMonth.parse(month).plusMonths(1).toString();monthInput=month;error=null;focus.clearFocus();keyboard?.hide()},enabled=month<"9999-12") {Icon(androidx.compose.ui.res.painterResource(R.drawable.ic_next),"Next month")}
            }
        }
        item { TextButton(onClick={enteringMonth=!enteringMonth;focus.clearFocus();keyboard?.hide()}) {Text(if(enteringMonth) "Close month entry" else "Enter a month")} }
        if(enteringMonth) item { Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(monthInput,{ monthInput=it },label={Text("Month · YYYY-MM")},singleLine=true,modifier=Modifier.fillMaxWidth().testTag("finance-month"))
            Button(onClick={ runCatching { FinanceWire.month(monthInput); month=monthInput; error=null;enteringMonth=false;focus.clearFocus();keyboard?.hide() }.onFailure { error="Enter a valid month as YYYY-MM" } }) { Text("Show month") }
        } }
        error?.let { item { Text(it,color=MaterialTheme.colorScheme.error) } }
        if(!state.ready) item { Text("Open your vault before changing finance records.") }
        when(section) {
            "Reports" -> {
                item { FinanceCard("$month · CAD") {
                    Text("Received income ${Money.format(report.getLong("receivedMinor"))}")
                    Text("Expenses ${Money.format(report.getLong("expenseMinor"))}")
                    Text("Net cash ${Money.format(report.getLong("netMinor"))}",style=MaterialTheme.typography.titleLarge)
                    Text("Savings allocated ${Money.format(report.getLong("savingsContributionMinor"))}")
                    Text("Savings are internal allocations. Scheduled amounts are excluded until recorded.",style=MaterialTheme.typography.bodySmall)
                } }
                val categories=report.getJSONArray("expenseByCategory")
                items((0 until categories.length()).map { categories.getJSONObject(it) }.filter { it.getLong("amountMinor")>0 }) { row -> Text("${row.getString("category")} · ${Money.format(row.getLong("amountMinor"))}") }
                item { OutlinedButton(onClick={csvConfirm=true},enabled=state.ready&&!state.busy,modifier=Modifier.fillMaxWidth()) { Text("Export all expenses as CSV") } }
            }
            "Budgets" -> {
                item { Button(onClick={edit(Budget(month=month,limitMinor=0))},enabled=state.ready&&!state.busy) { Text("Add budget") } }
                val budgets=FinanceMath.budgets(snapshot,month)
                if(budgets.isEmpty()) item { Text("No budgets for this month. Choose a category and limit to begin.") }
                items(budgets,key={it.budget.id}) { usage -> FinanceCard(usage.budget.category) {
                    Text("Spent ${Money.format(usage.spent)} of ${Money.format(usage.available)}")
                    Text("Carry ${Money.format(usage.carry)} · Remaining ${Money.format(usage.remaining)}")
                    if(usage.thresholdReached) Text(if(usage.remaining<0) "Over budget" else "Alert threshold reached",color=MaterialTheme.colorScheme.error)
                    TextButton(onClick={edit(usage.budget,true)},enabled=!state.busy) { Text("Edit budget") }
                } }
            }
            "Income" -> {
                item { Button(onClick={edit(IncomeSource(name="New source",grossMinor=1))},enabled=state.ready&&!state.busy) { Text("Add income source") } }
                items(state.finance.incomeSources,key={it.id}) { source -> FinanceCard(source.name) {
                    Text("${source.category.replace('_',' ')} · Expected ${Money.format(source.netMinor?:source.grossMinor)} · ${if(source.isActive) "Active" else "Inactive"}")
                    Text("Expected amounts are not received income.",style=MaterialTheme.typography.bodySmall)
                    Row { TextButton(onClick={edit(source,true)},enabled=!state.busy) { Text("Edit source") }; TextButton(onClick={edit(IncomeEntry(sourceId=source.id,amountMinor=maxOf(1,source.netMinor?:source.grossMinor)))},enabled=source.isActive&&!state.busy) { Text("Record received") } }
                } }
                items(dues.filter { it.income },key={"income-${it.id}/${it.date}"}) { due -> val source=state.finance.incomeSources.first { it.id==due.id }; OutlinedButton(onClick={edit(IncomeEntry(sourceId=due.id,amountMinor=maxOf(1,source.netMinor?:source.grossMinor),occurrenceDate=due.date))},enabled=!state.busy) { Text("Review income · ${source.name} · ${due.date}") } }
                item { Text("Received in $month",style=MaterialTheme.typography.titleLarge) }
                items(state.finance.incomeEntries.filter { it.receivedDate.startsWith(month) }.sortedByDescending { it.receivedDate },key={it.id}) { entry -> FinanceCard(state.finance.incomeSources.first { it.id==entry.sourceId }.name) {
                    Text("${entry.receivedDate} · ${Money.format(entry.amountMinor)}")
                    TextButton(onClick={edit(entry,true)},enabled=!state.busy) { Text("Edit received payment") }
                } }
            }
            "Savings" -> {
                item { Button(onClick={edit(SavingsGoal(name="New goal",targetMinor=1))},enabled=state.ready&&!state.busy) { Text("Add savings goal") } }
                items(state.finance.savingsGoals,key={it.id}) { goal -> val progress=FinanceMath.savings(snapshot,goal); FinanceCard("${goal.emoji} ${goal.name}") {
                    Text("${Money.format(progress.getLong("currentMinor"))} of ${Money.format(goal.targetMinor)} · ${goal.status}")
                    LinearProgressIndicator(progress={progress.getInt("progressBps")/10000f},modifier=Modifier.fillMaxWidth())
                    Text("Remaining ${Money.format(progress.getLong("remainingMinor"))} · Monthly plan ${Money.format(goal.monthlyContributionMinor)}")
                    Row { TextButton(onClick={edit(goal,true)},enabled=!state.busy) { Text("Edit goal") }; TextButton(onClick={edit(SavingsEntry(goalId=goal.id,goalName=goal.name,amountMinor=maxOf(1,goal.monthlyContributionMinor)))},enabled=goal.isActive&&!state.busy) { Text("Add contribution") } }
                } }
                item { Text("Contributions in $month",style=MaterialTheme.typography.titleLarge) }
                items(state.finance.savingsEntries.filter { it.date.startsWith(month) }.sortedByDescending { it.date },key={it.id}) { entry -> FinanceCard(entry.goalName) { Text("${entry.date} · ${Money.format(entry.amountMinor)}"); TextButton(onClick={edit(entry,true)},enabled=!state.busy) { Text("Edit contribution") } } }
            }
            "Recurring" -> {
                item { Text("Review each due expense before recording it. Templates never spend or record money automatically.") }
                item { Button(onClick={edit(RecurringExpense(merchant="New merchant",amountMinor=1))},enabled=state.ready&&!state.busy) { Text("Add recurring expense") } }
                items(dues.filter { !it.income },key={"expense-${it.id}/${it.date}"}) { due -> val template=state.finance.recurringExpenses.first { it.id==due.id }; OutlinedButton(onClick={dueExpense=due},enabled=!state.busy,modifier=Modifier.fillMaxWidth()) { Text("Review expense · ${template.merchant} · ${due.date}") } }
                items(state.finance.recurringExpenses,key={it.id}) { template -> FinanceCard(template.merchant) { Text("${Money.format(template.amountMinor)} · ${template.schedule.frequency} · ${if(template.isActive) "Active" else "Inactive"}"); TextButton(onClick={edit(template,true)},enabled=!state.busy) { Text("Edit template") } } }
            }
        }
    }
    editor?.let { record -> FinanceEditor(record,existing,state.busy,onDismiss={ if(!state.busy) editor=null },onSave={ updated ->
        val done: ()->Unit = { editor=null }
        if(!existing && updated is IncomeEntry && updated.occurrenceDate!=null) vm.postIncome(updated.sourceId,updated.occurrenceDate,updated.receivedDate,updated.amountMinor,updated.note,done) else vm.saveFinance(updated,done)
    },onDelete={deleting=record}) }
    deleting?.let { record -> AlertDialog(onDismissRequest={deleting=null},title={Text("Remove this record?")},text={Text("This removes the record from your local totals. Create a backup first to keep its history.")},confirmButton={TextButton(onClick={vm.deleteFinance(record) { deleting=null;editor=null }},enabled=!state.busy){Text("Remove record")}},dismissButton={TextButton(onClick={deleting=null}){Text("Keep record")}}) }
    dueExpense?.let { due -> val template=state.finance.recurringExpenses.first { it.id==due.id }; AlertDialog(onDismissRequest={dueExpense=null},title={Text("Record this expense?")},text={Text("${template.merchant}\n${Money.format(template.amountMinor)} CAD\n${due.date}\n${template.category}\nThis occurrence is recorded only once.")},confirmButton={TextButton(onClick={vm.postRecurring(due.id,due.date){dueExpense=null}},enabled=!state.busy){Text("Record expense")}},dismissButton={TextButton(onClick={dueExpense=null}){Text("Cancel")}}) }
    if(csvConfirm) AlertDialog(onDismissRequest={csvConfirm=false},title={Text("Export a readable CSV?")},text={Text("This file contains all expense details without encryption. Choose a private destination. For recovery of the full vault, use an encrypted backup.")},confirmButton={TextButton(onClick={csvConfirm=false;export.launch("Penny-expenses.csv")}){Text("Choose CSV destination")}},dismissButton={TextButton(onClick={csvConfirm=false}){Text("Cancel")}})
}

@Composable private fun FinanceCard(title: String, content: @Composable ColumnScope.()->Unit) { Card(Modifier.fillMaxWidth().testTag("finance-card-${title.trim()}")) { Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) { Text(title,style=MaterialTheme.typography.titleMedium);content() } } }

private data class FinanceField(val key: String,val label: String,val kind: String="text",val options: List<String> = emptyList(),val optional: Boolean=false)
private fun fields(record: FinanceRecord): List<FinanceField> {
    fun text(key:String,label:String,optional:Boolean=false)=FinanceField(key,label,optional=optional)
    fun money(key:String,label:String,optional:Boolean=false)=FinanceField(key,label,"money",optional=optional)
    fun flag(key:String,label:String)=FinanceField(key,label,"bool")
    fun select(key:String,label:String,options:List<String>)=FinanceField(key,label,"select",options)
    val schedule=listOf(select("schedule.frequency","Frequency",listOf("once","weekly","biweekly","monthly","yearly")),text("schedule.startDate","Start date · YYYY-MM-DD"),text("schedule.endDate","End date (optional)",true),FinanceField("schedule.dayOfMonth","Day of month (optional)","integer",optional=true))
    return when(record) {
        is Budget -> listOf(select("category","Category",Categories.all),text("month","Month · YYYY-MM"),money("limitMinor","Monthly limit · CAD"),flag("rollover","Carry unused balance from previous month"),FinanceField("alertThresholdBps","Alert threshold · percent","percent"),flag("notificationsEnabled","Remember local notification preference"))
        is IncomeSource -> listOf(text("name","Source name"),select("category","Income category",IncomeSource.categories),money("grossMinor","Expected gross · CAD"),money("netMinor","Expected net · CAD (optional)",true),flag("taxable","Taxable"),flag("isRecurring","Recurring income"),flag("isActive","Active source"),text("description","Description"))+schedule
        is IncomeEntry -> listOf(money("amountMinor","Actually received · CAD"),text("receivedDate","Received date · YYYY-MM-DD"),text("note","Note"))
        is SavingsGoal -> listOf(text("name","Goal name"),select("category","Savings category",SavingsGoal.categories),money("targetMinor","Target · CAD"),money("openingMinor","Opening balance · CAD"),money("monthlyContributionMinor","Monthly plan · CAD"),select("status","Status",listOf("active","achieved","paused","cancelled")),flag("isActive","Active goal"),select("priority","Priority",listOf("low","medium","high","critical")),text("description","Description"),text("emoji","Emoji"),text("startDate","Start date · YYYY-MM-DD"),text("targetDate","Target date (optional)",true),text("achievedDate","Achieved date (optional)",true))
        is SavingsEntry -> listOf(money("amountMinor","Actual contribution · CAD"),text("date","Contribution date · YYYY-MM-DD"),text("source","Source (optional)"),text("note","Note"))
        is RecurringExpense -> listOf(text("merchant","Merchant"),money("amountMinor","Amount · CAD"),select("category","Category",Categories.all),text("description","Description"),text("note","Note"),flag("isActive","Active template"))+schedule
        else -> emptyList()
    }
}

@Composable private fun FinanceEditor(record: FinanceRecord,existing: Boolean,busy: Boolean,onDismiss: ()->Unit,onSave: (FinanceRecord)->Unit,onDelete: ()->Unit) {
    val schema=remember(record.id){fields(record)}
    fun read(j:JSONObject,key:String):Any { val parts=key.split('.');return if(parts.size==1) j.get(key) else j.getJSONObject(parts[0]).get(parts[1]) }
    val values=remember(record.id){mutableStateMapOf<String,String>().apply { val json=record.json();schema.forEach { field -> val raw=read(json,field.key);put(field.key,if(raw===JSONObject.NULL || !existing && (field.key in listOf("name","merchant") || record is IncomeSource && field.key=="grossMinor" || record is SavingsGoal && field.key=="targetMinor" || (record is RecurringExpense || record is IncomeEntry || record is SavingsEntry) && field.key=="amountMinor")) "" else if(field.kind in listOf("money","percent")) Money.edit((raw as Number).toLong()) else raw.toString()) } }}
    var error by remember { mutableStateOf<String?>(null) }
    var choosing by remember { mutableStateOf<FinanceField?>(null) }
    val noun=when(record){is Budget->"budget";is IncomeSource->"income source";is IncomeEntry->"received payment";is SavingsGoal->"savings goal";is SavingsEntry->"contribution";else->"recurring expense"}
    AlertDialog(onDismissRequest=onDismiss,title={Text("${if(existing) "Edit" else "Add"} $noun")},text={Column(Modifier.verticalScroll(rememberScrollState()).testTag("finance-editor"),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        schema.forEach { field -> val value=values[field.key].orEmpty()
            when(field.kind) {
                "bool" -> Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(field.label,Modifier.weight(1f));Switch(value=="true",{values[field.key]=it.toString()},enabled=!busy,modifier=Modifier.testTag("finance-${field.key}").semantics { contentDescription=field.label })}
                "select" -> OutlinedButton(onClick={choosing=field},enabled=!busy,modifier=Modifier.fillMaxWidth().testTag("finance-${field.key}")){Text("${field.label}: ${value.replace('_',' ')}")}
                else -> OutlinedTextField(value,{values[field.key]=it},label={Text(field.label)},enabled=!busy,modifier=Modifier.fillMaxWidth().testTag("finance-${field.key}"),singleLine=field.key !in listOf("note","description"),keyboardOptions=KeyboardOptions(keyboardType=if(field.kind in listOf("money","percent")) KeyboardType.Decimal else if(field.kind=="integer") KeyboardType.Number else KeyboardType.Text))
            }
        }
        if(record is Budget) Text("Notification delivery is not enabled in this build; your preference is preserved.",style=MaterialTheme.typography.bodySmall)
        if(record is IncomeSource || record is SavingsGoal || record is RecurringExpense) Text("Turn off Active to retire this record while keeping its history.",style=MaterialTheme.typography.bodySmall)
        error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
        if(existing && record is Budget || existing && record is IncomeEntry || existing && record is SavingsEntry) TextButton(onClick=onDelete,enabled=!busy){Text("Remove record")}
    }},confirmButton={TextButton(onClick={runCatching {
        val json=record.json()
        schema.forEach { field -> val text=values[field.key].orEmpty();val parsed:Any=if(text.isBlank()&&field.optional) JSONObject.NULL else when(field.kind){"money","percent"->{require(Regex("(0|[1-9][0-9]*)(\\.[0-9]{1,2})?").matches(text)){"Enter an amount with at most two decimal places"};java.math.BigDecimal(text).movePointRight(2).longValueExact()};"integer"->text.toLong();"bool"->text.toBooleanStrict();else->if(field.key in listOf("name","merchant")) Wire.trim(text) else text}
            val parts=field.key.split('.');if(parts.size==1) json.put(field.key,parsed) else json.getJSONObject(parts[0]).put(parts[1],parsed)
        }
        json.optJSONObject("schedule")?.let { if(it.getString("frequency") in listOf("once","weekly","biweekly")) it.put("dayOfMonth",JSONObject.NULL) }
        json.put("updatedAt",maxOf(Wire.now(),record.json().getString("createdAt")))
        val updated=when(record){is Budget->Budget.decode(json);is IncomeSource->IncomeSource.decode(json);is IncomeEntry->IncomeEntry.decode(json);is SavingsGoal->SavingsGoal.decode(json);is SavingsEntry->SavingsEntry.decode(json);is RecurringExpense->RecurringExpense.decode(json);else->error("Unsupported record")}
        onSave(updated)
    }.onFailure { error=it.message?:"Check the entered details" }},enabled=!busy,modifier=Modifier.testTag("save-finance")){Text("Save on this device")}},dismissButton={TextButton(onClick=onDismiss,enabled=!busy){Text("Cancel")}})
    choosing?.let { field -> AlertDialog(onDismissRequest={choosing=null},title={Text(field.label)},text={Column(Modifier.verticalScroll(rememberScrollState())){field.options.forEach { choice -> TextButton(onClick={values[field.key]=choice;choosing=null},modifier=Modifier.fillMaxWidth()){Text(choice.replace('_',' '))} }}},confirmButton={TextButton(onClick={choosing=null}){Text("Done")}}) }
}
