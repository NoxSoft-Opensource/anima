package net.noxsoft.anima.android.ui

import androidx.compose.runtime.Composable
import net.noxsoft.anima.android.MainViewModel
import net.noxsoft.anima.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
