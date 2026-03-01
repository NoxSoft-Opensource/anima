package net.noxsoft.anima.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class AnimaProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", AnimaCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", AnimaCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", AnimaCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", AnimaCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", AnimaCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", AnimaCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", AnimaCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", AnimaCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", AnimaCapability.Canvas.rawValue)
    assertEquals("camera", AnimaCapability.Camera.rawValue)
    assertEquals("screen", AnimaCapability.Screen.rawValue)
    assertEquals("voiceWake", AnimaCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", AnimaScreenCommand.Record.rawValue)
  }
}
