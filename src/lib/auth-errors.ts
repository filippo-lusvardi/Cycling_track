// Firebase Auth error codes as messages a rider can act on.
import { FirebaseError } from "firebase/app";
import { t } from "./i18n";

export function authError(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return t("Wrong email or password", "Email o password errati");
    case "auth/invalid-email":
      return t("That email address isn't valid", "Indirizzo email non valido");
    case "auth/email-already-in-use":
      return t(
        "An account with this email already exists: sign in instead",
        "Esiste già un account con questa email: accedi",
      );
    case "auth/weak-password":
      return t(
        "Choose a longer password (at least 8 characters)",
        "Scegli una password più lunga (almeno 8 caratteri)",
      );
    case "auth/too-many-requests":
      return t(
        "Too many attempts. Wait a few minutes and try again",
        "Troppi tentativi. Attendi qualche minuto e riprova",
      );
    case "auth/network-request-failed":
      return t(
        "No connection. Signing in needs the internet",
        "Nessuna connessione. Per accedere serve internet",
      );
    case "auth/requires-recent-login":
      return t(
        "Enter your current password to confirm",
        "Inserisci la password attuale per confermare",
      );
    default:
      return t("Something went wrong. Try again", "Qualcosa è andato storto. Riprova");
  }
}
