import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Provider } from "react-redux";
import { Toaster } from "sonner";
import { store } from "./redux/store";
import AppRoutes from "./routes/AppRoutes";
import { bootstrapAuth, sessionExpired } from "./redux/authSlice";
import { setSessionExpiredHandler } from "./services/api.service";
import { clearLegacyStoredToken } from "./services/token.store";

// Drop the 1-day JWT older builds stored in localStorage.
clearLegacyStoredToken();

// A refresh that fails mid-session logs the user out; ProtectedRoute then
// sends them to /login.
setSessionExpiredHandler(() => store.dispatch(sessionExpired()));

function App() {
  return (
    <Provider store={store}>
      <AppBootstrap />
      <Toaster position="bottom-right" richColors theme="system" />
    </Provider>
  );
}

function AppBootstrap() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

  return <AppRoutes />;
}

export default App;
