package ca.penny.offline

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

@Composable fun PennyTheme(content: @Composable () -> Unit) {
    val light = lightColorScheme(primary = Color(0xFF245642), onPrimary = Color.White,
        primaryContainer = Color(0xFFCEE9CF), onPrimaryContainer = Color(0xFF143929),
        secondary = Color(0xFF76563F), secondaryContainer = Color(0xFFF2E4D5),
        tertiary = Color(0xFF9A4B39), tertiaryContainer = Color(0xFFFFDACE),
        background = Color(0xFFF9F8F2), surface = Color(0xFFF9F8F2),
        surfaceContainer = Color(0xFFF0F0E8), surfaceContainerLow = Color(0xFFF4F4EC),
        onSurface = Color(0xFF202820), onSurfaceVariant = Color(0xFF555E53))
    val dark = darkColorScheme(primary = Color(0xFFA5D4AD), onPrimary = Color(0xFF123A27),
        primaryContainer = Color(0xFF245642), secondaryContainer = Color(0xFF534638),
        background = Color(0xFF111812), surface = Color(0xFF111812))
    val type = Typography(displayMedium = TextStyle(fontFamily = FontFamily.Serif, fontSize = 46.sp, lineHeight = 54.sp, fontWeight = FontWeight.Normal),
        headlineLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 34.sp, lineHeight = 42.sp),
        headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 36.sp))
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) dark else light, typography = type, content = content)
}
