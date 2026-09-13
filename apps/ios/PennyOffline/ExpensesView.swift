import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

private struct ReceiptPhoto: Transferable {
    let data: Data
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            ReceiptPhoto(data: try StrictJSON.boundedRead(received.file, maximum: ReceiptPreparation.maximumInputBytes))
        }
    }
}

struct ExpensesView: View {
    @Bindable var store: VaultStore
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var search = ""
    @State private var adding = false
    @State private var editing: Expense?
    @State private var deleting: Expense?
    @State private var error: String?
    private var filtered: [Expense] {
        store.expenses.filter { search.isEmpty || $0.merchant.localizedCaseInsensitiveContains(search) || $0.category.localizedCaseInsensitiveContains(search) || $0.note.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("ON YOUR DEVICE", systemImage: "lock.fill")
                            .font(.caption.weight(.semibold)).foregroundStyle(Color.pennySecondary).fixedSize(horizontal: false, vertical: true)
                        Text(Money.formatted(store.currentMonthTotal))
                            .font(.system(.largeTitle, design: .rounded, weight: .bold))
                            .contentTransition(.numericText())
                            .accessibilityIdentifier("monthlyTotal")
                            .accessibilityLabel("Spent this month in Canadian dollars").accessibilityValue(Money.input(store.currentMonthTotal))
                        Text("Spent this month").font(.subheadline).foregroundStyle(Color.pennySecondary)
                        if typeSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("\(store.expenses.count) expenses")
                                Label("Offline ready", systemImage: "checkmark.circle.fill").foregroundStyle(Color.pennyAccent)
                            }.font(.caption)
                        } else {
                            HStack {
                                Text("\(store.expenses.count) expenses")
                                Spacer()
                                Label("Offline ready", systemImage: "checkmark.circle.fill").foregroundStyle(Color.pennyAccent)
                            }.font(.caption)
                        }
                    }
                    .padding(.vertical, 14)
                }
                .listRowBackground(Color.pennyAccent.opacity(0.08))
                Section {
                    if filtered.isEmpty {
                        VStack(spacing: 16) {
                            Image(systemName: search.isEmpty ? "leaf" : "magnifyingglass").font(.largeTitle).foregroundStyle(Color.pennyAccent).accessibilityHidden(true)
                            Text(search.isEmpty ? "A fresh start" : "No matches").font(.title2.bold())
                            Text(search.isEmpty ? "Add your first expense. Your money story stays with you." : "Try another merchant, category, or note.")
                                .font(.body).foregroundStyle(Color.pennySecondary).fixedSize(horizontal: false, vertical: true)
                            if search.isEmpty { Button("Add an expense") { adding = true }.font(.body).buttonStyle(.glassProminent).tint(Color.pennyButton).foregroundStyle(.white) }
                        }.frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.vertical, 24)

                    }
                    ForEach(filtered) { expense in
                        Button { editing = expense } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "receipt").font(.title3).foregroundStyle(Color.pennyAccent)
                                    .frame(width: 38, height: 42).background(Color.pennyAccent.opacity(0.08), in: .rect(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(expense.merchant).font(.body.weight(.semibold)).foregroundStyle(.primary)
                                    Text(expense.category).font(.caption).foregroundStyle(Color.pennySecondary).lineLimit(2)
                                    Text(expense.expenseDate).font(.caption2).foregroundStyle(Color.pennySecondary)
                                }
                                Spacer(minLength: 4)
                                Text(Money.formatted(expense.amountMinor)).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                            }.padding(.vertical, 5)
                        }
                        .accessibilityIdentifier("expense-\(expense.merchant)")
                        .swipeActions { Button("Delete", role: .destructive) { deleting = expense } }
                    }
                } header: { Text("Your expenses").foregroundStyle(Color.pennySecondary) }
            }
            .navigationTitle("Penny")
            .searchable(text: $search, prompt: "Search your expenses")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add expense", systemImage: "plus") { adding = true }.accessibilityIdentifier("addExpense")
                }
            }
            .sheet(isPresented: $adding) { ExpenseEditor(store: store) }
            .sheet(item: $editing) { ExpenseEditor(store: store, expense: $0) }
            .confirmationDialog("Delete this expense?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button("Delete expense", role: .destructive) {
                    guard let deleting else { return }
                    Task { do { try await store.deleteAsync(deleting.id) } catch { self.error = error.localizedDescription } }
                    self.deleting = nil
                }
            } message: { Text("This removes it from this device. Older backup files are unchanged.") }
            .alert("Could not save", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }
}

struct ExpenseEditor: View {
    var store: VaultStore
    var expense: Expense?
    @Environment(\.dismiss) private var dismiss
    @State private var fields = ReceiptReviewDraft()
    @State private var date = CivilDate.date(CivilDate.string(Date()))!
    @State private var note = ""
    @State private var sourceText = ""
    @State private var description = ""
    @State private var photo: PhotosPickerItem?
    @State private var busy = false
    @State private var error: String?
    @State private var assisted = false
    @State private var receiptLocale = ""
    @State private var proposal: ReceiptProposal?
    @State private var processing: Task<Void, Never>?
    @State private var requestID = UUID()
    @State private var preparedReceipt: PreparedReceipt?
    @State private var showingCamera = false
    @State private var recordID = UUID().uuidString.lowercased()
    @State private var receipts: [ReceiptAttachment] = []
    @State private var viewingReceipt: ReceiptAttachment?
    @State private var importingReceipt = false
    @State private var initialized = false
    @State private var preservedCivilDate: String?

    var body: some View {
        NavigationStack {
            Form {
                if expense == nil {
                    Section {
                        DisclosureGroup("Capture on device") {
                            Text(LocalAssistant.availabilityMessage).font(.footnote).foregroundStyle(Color.pennySecondary)
                            Picker("Receipt language", selection: $receiptLocale) {
                                Text("Choose a language").tag("")
                                Text("English (Canada)").tag("en-CA")
                                Text("French (Canada)").tag("fr-CA")
                            }.accessibilityIdentifier("receiptLocale")
                            TextField("Paste receipt text", text: $sourceText, axis: .vertical).lineLimit(3...7).accessibilityIdentifier("receiptSource")
                            ForEach(receipts) { receipt in
                                Button("Read attached receipt \(receipts.firstIndex(of: receipt)! + 1) text") {
                                    do { recognizeReceipt(try receipt.bytes()) } catch { self.error = error.localizedDescription }
                                }.disabled(busy || receiptLocale.isEmpty)
                            }
                            Button("Read receipt text", systemImage: "text.viewfinder") { parseReceipt() }
                                .disabled(busy || receiptLocale.isEmpty).accessibilityIdentifier("parseReceipt")
                            Button("Suggest category on device", systemImage: "sparkles") { suggest() }
                                .disabled(busy || !LocalAssistant.isAvailable || receiptLocale.isEmpty || sourceText.isEmpty)
                            if let proposal {
                                ForEach(proposal.reasons, id: \.self) { reason in Text(ReceiptParser.explanation(reason)).font(.footnote) }
                                Text("Review every proposed field below. Nothing is saved until you tap Save.").font(.footnote)
                            }
                            if busy { Button("Cancel processing") { cancelProcessing() } }
                            if busy { ProgressView("Processing on this device…") }
                        }
                    } footer: { Text("Suggestions stay on your device. Review the amount, date, and category before saving.") }
                }
                Section("Expense details") {
                    TextField("Merchant", text: $fields.merchant).textContentType(.organizationName).accessibilityIdentifier("merchantField")
                    HStack { Text("CAD").foregroundStyle(Color.pennySecondary); TextField("0.00", text: $fields.amount).keyboardType(.decimalPad).accessibilityIdentifier("amountField") }
                    if let preservedCivilDate {
                        LabeledContent("Date", value: preservedCivilDate)
                        Button("Choose a different date") { self.preservedCivilDate = nil }
                        Text("This historic date is retained exactly. Choose a different date only if you want to change it.").font(.footnote).foregroundStyle(Color.pennySecondary)
                    } else {
                        DatePicker("Date", selection: $date, displayedComponents: .date)
                            .environment(\.timeZone, TimeZone(secondsFromGMT: 0)!)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                    }
                    Picker("Category", selection: $fields.category) {
                        ForEach(Categories.all, id: \.self) { Text($0).tag($0) }
                    }
                    TextField("Description (optional)", text: $description, axis: .vertical).lineLimit(2...5)
                    TextField("Note (optional)", text: $note, axis: .vertical).lineLimit(2...5)
                }
                Section {
                    ForEach(receipts) { receipt in
                        HStack {
                            Button("View receipt \(receipts.firstIndex(of: receipt)! + 1)", systemImage: "doc.text.image") { viewingReceipt = receipt }
                                .accessibilityIdentifier("viewReceipt-\(receipt.id)")
                            Spacer()
                            Button("Remove receipt", systemImage: "trash", role: .destructive) { receipts.removeAll { $0.id == receipt.id } }
                                .labelStyle(.iconOnly).accessibilityIdentifier("removeReceipt-\(receipt.id)")
                        }.buttonStyle(.borderless)
                    }
                    PhotosPicker(selection: $photo, matching: .images, preferredItemEncoding: .current) {
                        Label("Attach receipt photo", systemImage: "photo")
                    }.disabled(busy)
                    Button("Take receipt photo", systemImage: "camera") { openCamera() }.disabled(busy).accessibilityIdentifier("captureReceiptCamera")
                    Button("Attach receipt from Files", systemImage: "folder") { importingReceipt = true }.disabled(busy)
                        .accessibilityIdentifier("attachReceiptFile")
                    if busy { ProgressView("Processing on this device…") }
                } header: { Text("Receipts") } footer: {
                    Text("Supported JPEG and PNG originals stay unchanged. Larger images and HEIC require review of an optimized JPEG copy. Save keeps accepted receipts encrypted with this expense and in your backups. Up to 2 MiB each, 4096 pixels per side, 16 megapixels; 8 MiB and 100 receipts per vault. Receipt removals take effect when you save.")
                }
                if assisted { Label("Review the suggestion before saving", systemImage: "checkmark.bubble").font(.footnote).foregroundStyle(Color.pennySecondary) }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("formError") }
            }
            .navigationTitle(expense == nil ? "Add expense" : "Edit expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { busy = true; processing = Task { await save(); busy = false } }.bold().disabled(busy).accessibilityIdentifier("saveExpense") }
            }
            .onAppear {
                guard !initialized else { return }
                initialized = true
                if let expense {
                    recordID = expense.id
                    receipts = store.receipts(for: expense.id)
                    fields.merchant = expense.merchant; fields.amount = Money.input(expense.amountMinor)
                    if let converted = CivilDate.date(expense.expenseDate) { date = converted }
                    else { preservedCivilDate = expense.expenseDate }
                    fields.category = expense.category; note = expense.note; description = expense.description
                }
            }
            .sheet(item: $viewingReceipt) { ReceiptViewer(receipt: $0) }
            .sheet(item: $preparedReceipt) { prepared in
                PreparedReceiptReview(receipt: prepared) { attach(prepared.data) }
            }
            .fullScreenCover(isPresented: $showingCamera) {
                ReceiptCamera { result in
                    showingCamera = false
                    do {
                        if let image = try result.get() { preparedReceipt = try ReceiptPreparation.camera(image) }
                    } catch { self.error = error.localizedDescription }
                }.ignoresSafeArea()
            }
            .onDisappear { cancelProcessing() }
            .onChange(of: receiptLocale) { _, _ in cancelProcessing(); proposal = nil }
            .onChange(of: sourceText) { _, _ in cancelProcessing(); proposal = nil }
            .fileImporter(isPresented: $importingReceipt, allowedContentTypes: [.jpeg, .png, .heic]) { result in
                do {
                    let url = try result.get()
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let bytes = try StrictJSON.boundedRead(url, maximum: ReceiptPreparation.maximumInputBytes)
                    prepareAttachment(bytes)
                } catch { self.error = "The receipt was not attached. Choose a static JPEG, PNG or HEIC up to 20 MiB from an available Files location." }
            }
            .onChange(of: photo) { _, selected in
                guard let selected else { return }
                cancelProcessing(); let token = requestID; busy = true; error = nil
                processing = Task {
                    do {
                        guard let image = try await selected.loadTransferable(type: ReceiptPhoto.self) else {
                            throw ReceiptAttachment.ReceiptError.invalid
                        }
                        guard requestID == token, !Task.isCancelled else { return }
                        prepareAttachment(image.data)
                    } catch {
                        guard requestID == token, !Task.isCancelled else { return }
                        busy = false
                        self.error = "The receipt was not attached. Choose a static JPEG, PNG or HEIC up to 20 MiB that is available on this device."
                    }
                    photo = nil
                }
            }
        }
    }
    private func cancelProcessing() { fields.cancelCategory(); processing?.cancel(); processing = nil; requestID = UUID(); busy = false }
    private func openCamera() {
        cancelProcessing(); let token = requestID; busy = true; error = nil
        processing = Task {
            do { try await ReceiptCameraAccess.request(); guard requestID == token else { return }; showingCamera = true }
            catch { if requestID == token && !(error is CancellationError) { self.error = error.localizedDescription } }
            if requestID == token { busy = false }
        }
    }
    private func prepareAttachment(_ data: Data) {
        cancelProcessing(); let token = requestID; busy = true; error = nil
        processing = Task {
            do {
                let prepared = try await Task.detached(priority: .userInitiated) { try ReceiptPreparation.prepare(data) }.value
                guard requestID == token, !Task.isCancelled else { return }
                if prepared.optimized { preparedReceipt = prepared; busy = false }
                else { attach(prepared.data) }
            } catch { if requestID == token { busy = false; self.error = error.localizedDescription } }
        }
    }
    private func attach(_ data: Data) {
        do {
            let receipt = try ReceiptAttachment(data: data, expenseId: recordID)
            let existing = store.snapshot.attachments.filter { $0.expenseId != recordID }
            guard existing.count + receipts.count + 1 <= ReceiptAttachment.maximumCount,
                  (existing + receipts).reduce(0, { $0 + $1.byteCount }) + receipt.byteCount <= ReceiptAttachment.maximumTotalBytes else { throw ReceiptAttachment.ReceiptError.capacity }
            receipts.append(receipt)
            busy = false; error = nil
            if !receiptLocale.isEmpty { recognizeReceipt(data) }
        } catch { busy = false; self.error = error.localizedDescription }
    }
    private func recognizeReceipt(_ data: Data) {
        guard !receiptLocale.isEmpty else { return }
        cancelProcessing(); let token = requestID; let locale = receiptLocale; busy = true
        processing = Task {
            do {
                let text = try await LocalAssistant.recognize(data, locale: locale)
                guard requestID == token, !Task.isCancelled else { return }
                sourceText = text
                if text.isEmpty { error = "Receipt attached. No readable text was found; enter the details manually, then save." }
            } catch { if requestID == token && !(error is CancellationError) { self.error = "Receipt attached. Text recognition failed; enter the details manually, then save." } }
            if requestID == token { busy = false }
        }
    }
    private func apply(_ draft: ReceiptProposal) {
        proposal = draft; fields.populate(draft)
        assisted = true
    }
    private func parseReceipt() {
        error = nil
        do { apply(try ReceiptParser.parse(sourceText, locale: receiptLocale)) }
        catch { self.error = "Use at most 4,000 characters and choose English or French (Canada). The original receipt text has not been shortened." }
    }
    private func suggest() {
        cancelProcessing(); error = nil
        do { _ = try ReceiptParser.parse(sourceText, locale: receiptLocale) }
        catch { self.error = error.localizedDescription; return }
        let token = requestID, text = sourceText, locale = receiptLocale; busy = true
        processing = Task {
            do {
                let suggestion = try await fields.suggestCategory(source: text, locale: locale) { try await LocalAssistant.suggest(text, locale: locale) }
                guard requestID == token, !Task.isCancelled, sourceText == text, receiptLocale == locale else { return }
                proposal = suggestion; assisted = suggestion != nil
            } catch { if requestID == token && !(error is CancellationError) { self.error = "The model suggestion was unavailable or did not match this receipt. Your current entries are unchanged; review them manually." } }
            if requestID == token { busy = false }
        }
    }
    private func save() async {
        do {
            var record = try Expense(id: recordID, merchant: fields.merchant,
                                     amountMinor: Money.parse(fields.amount), expenseDate: preservedCivilDate ?? CivilDate.string(date, timeZone: TimeZone(secondsFromGMT: 0)!),
                                     category: fields.category, note: note, createdAt: expense?.createdAt ?? CivilDate.timestamp())
            record.description = description
            record.recurringTemplateId = expense?.recurringTemplateId
            record.recurringOccurrenceDate = expense?.recurringOccurrenceDate
            try await store.saveAsync(record, attachments: receipts)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

private struct ReceiptViewer: View {
    let receipt: ReceiptAttachment
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                if let bytes = try? receipt.bytes(), let image = UIImage(data: bytes) {
                    Image(uiImage: image).resizable().scaledToFit().padding()
                        .accessibilityLabel("Saved receipt image").accessibilityIdentifier("receiptOriginal")
                } else {
                    ContentUnavailableView("Receipt unavailable", systemImage: "exclamationmark.triangle")
                }
            }
            .navigationTitle("Receipt")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
