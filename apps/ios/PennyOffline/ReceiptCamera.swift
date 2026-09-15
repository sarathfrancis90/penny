import AVFoundation
import SwiftUI
import UIKit

@MainActor enum ReceiptCameraAccess {
    static func message(status: AVAuthorizationStatus, available: Bool) -> String? {
        guard available else { return "A camera is unavailable here. Attach a photo or file, paste receipt text, or enter the expense manually." }
        switch status {
        case .denied, .restricted: return "Camera access is off. You can allow it in Settings, attach a photo or file, or enter the expense manually."
        default: return nil
        }
    }
    static func request() async throws {
        #if targetEnvironment(simulator)
        throw Failure(message: message(status: .authorized, available: false)!)
        #else
        let available = UIImagePickerController.isSourceTypeAvailable(.camera)
        if let message = message(status: AVCaptureDevice.authorizationStatus(for: .video), available: available) { throw Failure(message: message) }
        if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
            guard await AVCaptureDevice.requestAccess(for: .video) else { throw Failure(message: message(status: .denied, available: true)!) }
        }
        try Task.checkCancellation()
        #endif
    }
    struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }
}

struct ReceiptCamera: UIViewControllerRepresentable {
    let completed: (Result<UIImage?, Error>) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completed: completed) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let camera = UIImagePickerController(); camera.sourceType = .camera
        camera.cameraCaptureMode = .photo; camera.allowsEditing = false
        camera.delegate = context.coordinator
        return camera
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let completed: (Result<UIImage?, Error>) -> Void
        init(completed: @escaping (Result<UIImage?, Error>) -> Void) { self.completed = completed }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completed(.success(nil)) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let image = info[.originalImage] as? UIImage else { completed(.failure(ReceiptPreparation.Failure.unsupported)); return }
            // The camera image remains in memory. No photo-library write or disk staging.
            completed(.success(image))
        }
    }
}

struct PreparedReceiptReview: View {
    let receipt: PreparedReceipt
    let accept: () -> Void
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Save an optimized copy").font(.title2.bold())
                    Text("This receipt will be saved as a smaller JPEG copy, not the original file. Check that every amount and detail is readable. The original input is kept only in memory and is discarded when you leave this review.")
                    Text("Saved copy: \(ByteCountFormatter.string(fromByteCount: Int64(receipt.data.count), countStyle: .file))").font(.footnote)
                    if let image = UIImage(data: receipt.data) {
                        Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Optimized receipt preview")
                    }
                }.padding()
            }
            .navigationTitle("Review receipt copy").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Use this copy") { accept(); dismiss() }.accessibilityIdentifier("acceptOptimizedReceipt") }
            }
        }
    }
}
