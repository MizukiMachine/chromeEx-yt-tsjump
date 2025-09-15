import { useState } from 'preact/hooks'
import { t } from '../../utils/i18n'
import { showToast } from '../../ui/toast'
import { Keys, setBool } from '../../store/local'
import { 
  loadCustomButtonsAsync, 
  saveCustomButtons, 
  getEnabledButtons, 
  validateLabel, 
  validateSeconds,
  type CustomButton as StoreCustomButton,
} from '../../store/customButtons'

export type DisplayButton = { label: string; seconds: number }

interface UseCustomButtonsEditorArgs {
  isEditMode: boolean
  setIsEditMode: (v: boolean) => void
  customButtons: DisplayButton[]
  setCustomButtons: (buttons: StoreCustomButton[]) => void
  showCustomButtons: boolean
  setShowCustomButtons: (v: boolean) => void
}

export function useCustomButtonsEditor({
  isEditMode,
  setIsEditMode,
  customButtons,
  setCustomButtons,
  showCustomButtons,
  setShowCustomButtons,
}: UseCustomButtonsEditorArgs) {
  const [editingButton, setEditingButton] = useState<number | null>(null)
  const [editingValues, setEditingValues] = useState<{ label: string; seconds: string }>({ label: '', seconds: '' })

  // 表示インデックスから実インデックスへ対応付けして編集開始
  const startEditButton = (displayIndex: number) => {
    if (!isEditMode) return
    const button = customButtons[displayIndex]
    if (!button) return

    loadCustomButtonsAsync().then(config => {
      let actualIndex = -1
      let enabledCount = 0
      for (let i = 0; i < config.buttons.length; i++) {
        if (config.buttons[i].enabled && config.buttons[i].label.trim() !== '') {
          if (enabledCount === displayIndex) { actualIndex = i; break }
          enabledCount++
        }
      }
      if (actualIndex !== -1) {
        setEditingButton(actualIndex)
        setEditingValues({ label: button.label, seconds: button.seconds.toString() })
      }
    })
  }

  const toggleEditMode = () => {
    const next = !isEditMode
    setIsEditMode(next)
    if (!next) {
      // 編集終了時に状態リセット
      setEditingButton(null)
      setEditingValues({ label: '', seconds: '' })
    }
  }

  const toggleCustomButtons = () => {
    const newState = !showCustomButtons
    setShowCustomButtons(newState)
    try { setBool(Keys.CardCustomOpen, newState) } catch {}
    // 閉じるときは編集も終了
    if (!newState && isEditMode) {
      setIsEditMode(false)
      setEditingButton(null)
      setEditingValues({ label: '', seconds: '' })
    }
  }

  const saveEditButton = () => {
    if (editingButton === null) return
    const labelValidation = validateLabel(editingValues.label)
    const secondsValue = parseInt(editingValues.seconds) || 0
    const secondsValidation = validateSeconds(secondsValue)
    if (!labelValidation.valid) { showToast(labelValidation.error || 'Invalid label', 'warn'); return }
    if (!secondsValidation.valid) { showToast(secondsValidation.error || 'Invalid seconds', 'warn'); return }

    loadCustomButtonsAsync().then(config => {
      const newButtons = [...config.buttons]
      if (editingButton >= 0 && editingButton < newButtons.length) {
        newButtons[editingButton] = {
          label: editingValues.label,
          seconds: secondsValue,
          enabled: editingValues.label.trim() !== ''
        }
        saveCustomButtons({ buttons: newButtons })
        setCustomButtons(getEnabledButtons({ buttons: newButtons }))
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
        showToast(t('toast.button_updated'), 'info')
      } else {
        showToast(t('toast.button_not_found'), 'warn')
      }
    }).catch(() => {
      showToast(t('toast.failed_update'), 'warn')
    })
  }

  const cancelEditButton = () => {
    setEditingButton(null)
    setEditingValues({ label: '', seconds: '' })
  }

  const addNewButton = () => {
    if (!isEditMode) return
    loadCustomButtonsAsync().then(config => {
      const firstEmptyIndex = config.buttons.findIndex(btn => !btn.enabled || btn.label.trim() === '')
      if (firstEmptyIndex === -1) { showToast('Maximum 6 buttons allowed', 'warn'); return }
      // 既存の仕様に合わせ、表示配列の末尾に対する編集開始相当の挙動
      setEditingButton(customButtons.length)
      setEditingValues({ label: '', seconds: '60' })
    }).catch(() => {
      showToast('Failed to add new button', 'warn')
    })
  }

  // 外部からのクローズ時に編集状態を確実にリセットするためのヘルパ
  const resetEditing = () => {
    setIsEditMode(false)
    setEditingButton(null)
    setEditingValues({ label: '', seconds: '' })
  }

  return {
    // states
    editingButton,
    editingValues,
    // setters for inputs
    setEditingValues,
    // controls
    startEditButton,
    toggleEditMode,
    toggleCustomButtons,
    saveEditButton,
    cancelEditButton,
    addNewButton,
    resetEditing,
  }
}

export default useCustomButtonsEditor
