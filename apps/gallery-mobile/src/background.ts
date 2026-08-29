import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { backupOnce } from "./backup"

export const TASK = "darkgallery-backup"

// Defined at module scope on purpose: the OS loads this bundle cold, with no
// UI mounted, to run the task.
TaskManager.defineTask(TASK, async () => {
  try {
    await backupOnce()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundBackup() {
  // Both platforms treat the interval as a hint, not a promise — Android's
  // WorkManager and iOS's BGTaskScheduler decide the real cadence from battery
  // and usage. iOS may run this rarely or never while the app goes unused,
  // which is why the app also backs up on every foreground.
  if (await TaskManager.isTaskRegisteredAsync(TASK)) return
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 })
}

export async function unregisterBackgroundBackup() {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK)
}
