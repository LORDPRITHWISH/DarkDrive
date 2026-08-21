import { registerRootComponent } from "expo"
import App from "./App"
// Imported for its side effect: the background task must be defined in module
// scope, because the OS loads this bundle cold to run it with no UI mounted.
import "./src/background"

registerRootComponent(App)
