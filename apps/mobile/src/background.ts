import * as BackgroundTask from "expo-background-task"
import * as TaskManager from "expo-task-manager"
import { syncOnce } from "./sync"

export const TASK = "darkdrive-sync"

// Defined at module scope on purpose: the OS loads this bundle cold, with no
// UI mounted, to run the task.
TaskManager.defineTask(TASK, async () => {
  try {
    await syncOnce()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registerBackgroundSync() {
  // Both platforms treat the interval as a hint, not a promise — Android's
  // WorkManager and iOS's BGTaskScheduler decide the real cadence from battery
  // and usage patterns. iOS in particular may run this rarely or never while
  // the app is unused, which is why the app also syncs on every foreground.
  if (await TaskManager.isTaskRegisteredAsync(TASK)) return
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 })
}

export async function unregisterBackgroundSync() {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK)
}
