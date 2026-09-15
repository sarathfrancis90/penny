import SwiftUI
import UIKit

extension Color {
    // Preserve system light/dark adaptation with enough contrast on grouped cards.
    static let pennySecondary = Color(uiColor: .label)
    // Dark teal keeps small accent text legible on light surfaces; the lighter
    // dark-mode accent remains distinct against grouped system backgrounds.
    static let pennyAccent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 112 / 255, green: 216 / 255, blue: 204 / 255, alpha: 1)
            : UIColor(red: 0, green: 90 / 255, blue: 85 / 255, alpha: 1)
    })
    // Prominent buttons keep white titles in both appearances.
    static let pennyButton = Color(red: 0, green: 90 / 255, blue: 85 / 255)
}
