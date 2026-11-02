import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

// Who answers for the data (the "controller" under the GDPR) and how to reach them.
const CONTROLLER = "Filippo Lusvardi";
const CONTACT = "privacy@example.com";
const UPDATED = "2 November 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: t("Privacy — Cirmolo", "Privacy — Cirmolo") }] }),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_b]:font-medium [&_b]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}

/** The GDPR information notice (art. 13): what Cirmolo stores, where, why, for how long, and your rights. */
function PrivacyPage() {
  const router = useRouter();
  const mail = (
    <a className="text-primary underline" href={`mailto:${CONTACT}`}>
      {CONTACT}
    </a>
  );

  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-8">
      <button
        onClick={() => router.history.back()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("Back", "Indietro")}
      </button>
      <div>
        <div className="eyebrow">Cirmolo</div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("Privacy notice", "Informativa privacy")}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(`Last updated ${UPDATED}`, `Ultimo aggiornamento: ${UPDATED}`)}
        </p>
      </div>

      <Section title={t("Who is responsible", "Titolare del trattamento")}>
        <p>
          {t(
            `Cirmolo is run by ${CONTROLLER}, who is the controller of your personal data under the EU General Data Protection Regulation (GDPR). For any question or request about your data, write to `,
            `Cirmolo è gestito da ${CONTROLLER}, titolare del trattamento dei tuoi dati personali ai sensi del Regolamento UE 2016/679 (GDPR). Per qualsiasi domanda o richiesta sui tuoi dati scrivi a `,
          )}
          {mail}.
        </p>
      </Section>

      <Section title={t("What is stored in your account", "Cosa viene salvato nel tuo account")}>
        <ul>
          <li>
            <b>{t("Email address and password", "Indirizzo email e password")}</b>
            {t(
              ", to sign you in. The password is handled by Firebase Authentication and is never visible to Cirmolo.",
              ", per farti accedere. La password è gestita da Firebase Authentication e Cirmolo non può vederla.",
            )}
          </li>
          <li>
            <b>{t("Your intervals.icu API key", "La tua chiave API di intervals.icu")}</b>
            {t(
              ", so every device you sign in on can load your data. Security rules let only your own account read it.",
              ", così ogni dispositivo su cui accedi può caricare i tuoi dati. Le regole di sicurezza permettono di leggerla solo al tuo account.",
            )}
          </li>
          <li>
            <b>{t("Saved segments", "Segmenti salvati")}</b>
            {t(
              " (the climbs you star, rename or create: name and start/finish coordinates) and the amount of history to analyse.",
              " (le salite che aggiungi ai preferiti, rinomini o crei: nome e coordinate di partenza e arrivo) e quanto storico analizzare.",
            )}
          </li>
        </ul>
        <p>
          {t(
            "Cirmolo also keeps a list of place names for climbs, looked up on OpenStreetMap. It holds only a climb's start/finish coordinates and its name, is not linked to any account, and is shared by all users so each climb is looked up once.",
            "Cirmolo conserva anche un elenco di nomi di luoghi per le salite, ricavati da OpenStreetMap. Contiene solo le coordinate di partenza/arrivo e il nome della salita, non è collegato a nessun account ed è condiviso tra tutti gli utenti, così ogni salita viene cercata una volta sola.",
          )}
        </p>
      </Section>

      <Section title={t("Accounts without intervals.icu", "Account senza intervals.icu")}>
        <p>
          {t(
            "If you use Cirmolo without intervals.icu, Cirmolo itself stores your training data in your account: your rides (GPS track, power, heart rate, cadence, from the files you upload), the numbers computed from them, your check-ins (sleep, HRV, fatigue, stress, mood), weight and body fat, races and sick or injured days. Heart rate, HRV, sleep and weight are health data: Cirmolo stores them only with your explicit consent, given when you choose this option, and you can withdraw it at any time by deleting your account.",
            "Se usi Cirmolo senza intervals.icu, è Cirmolo a conservare i tuoi dati di allenamento nel tuo account: le uscite (traccia GPS, potenza, frequenza cardiaca, cadenza, dai file che carichi), i valori calcolati, i check-in (sonno, HRV, fatica, stress, umore), peso e massa grassa, gare e giorni di malattia o infortunio. Frequenza cardiaca, HRV, sonno e peso sono dati relativi alla salute: Cirmolo li conserva solo con il tuo consenso esplicito, dato quando scegli questa opzione, e puoi revocarlo in qualsiasi momento eliminando l'account.",
          )}
        </p>
      </Section>

      <Section
        title={t(
          "With intervals.icu: what is not stored",
          "Con intervals.icu: cosa non viene salvato",
        )}
      >
        <p>
          {t(
            "Your rides, wellness, check-ins, weight and other training data stay on intervals.icu. Your browser fetches them directly from intervals.icu with your key; they never pass through Cirmolo's servers. A copy is kept in your browser's storage on each device so the app works offline, and it is erased when you sign out.",
            "Attività, benessere, check-in, peso e gli altri dati di allenamento restano su intervals.icu. Il tuo browser li scarica direttamente da intervals.icu con la tua chiave: non passano mai dai server di Cirmolo. Una copia resta nell'archivio del browser di ogni dispositivo, così l'app funziona offline, e viene cancellata quando esci dall'account.",
          )}
        </p>
        <p>
          {t(
            "Cirmolo uses no advertising, analytics or tracking cookies. Browser storage is used only to make the app work.",
            "Cirmolo non usa pubblicità, statistiche né cookie di tracciamento. L'archivio del browser serve solo al funzionamento dell'app.",
          )}
        </p>
      </Section>

      <Section title={t("Why, and on what legal basis", "Finalità e base giuridica")}>
        <p>
          {t(
            "The data above is used only to provide the service you signed up for: signing you in, connecting to intervals.icu, analysing your training and keeping it in step across devices (GDPR art. 6(1)(b), performance of a contract). Health data is processed only with your explicit consent (GDPR art. 9(2)(a)). Nothing is sold, used for marketing or shared with AI services.",
            "I dati sopra sono usati solo per fornirti il servizio a cui ti sei iscritto: farti accedere, collegarti a intervals.icu, analizzare il tuo allenamento e allinearlo tra i dispositivi (art. 6, par. 1, lett. b GDPR, esecuzione di un contratto). I dati relativi alla salute sono trattati solo con il tuo consenso esplicito (art. 9, par. 2, lett. a GDPR). Nulla viene venduto, usato per marketing o condiviso con servizi di intelligenza artificiale.",
          )}
        </p>
      </Section>

      <Section title={t("Services involved", "Servizi coinvolti")}>
        <ul>
          <li>
            <b>Google Firebase</b>
            {t(
              " (Google Ireland Ltd.): accounts and the stored data listed above, as data processor. Google may process data outside the EU under the EU–US Data Privacy Framework and standard contractual clauses.",
              " (Google Ireland Ltd.): account e dati salvati elencati sopra, come responsabile del trattamento. Google può trattare dati fuori dall'UE in base all'EU–US Data Privacy Framework e alle clausole contrattuali standard.",
            )}
          </li>
          <li>
            <b>Cloudflare Pages</b>
            {t(
              ": serves the app's files. Like any web host it sees your IP address when the app loads.",
              ": distribuisce i file dell'app. Come ogni hosting vede il tuo indirizzo IP quando l'app si carica.",
            )}
          </li>
          <li>
            <b>intervals.icu</b>
            {t(
              ": your training data, under your own agreement with intervals.icu.",
              ": i tuoi dati di allenamento, in base al tuo accordo con intervals.icu.",
            )}
          </li>
          <li>
            <b>OpenStreetMap, OpenTopoMap, Esri</b>
            {t(
              ": map tiles, and place-name lookups (OpenStreetMap Nominatim, which receives a climb's coordinates). They see your IP address.",
              ": tasselli delle mappe e ricerca dei nomi dei luoghi (OpenStreetMap Nominatim, che riceve le coordinate di una salita). Vedono il tuo indirizzo IP.",
            )}
          </li>
        </ul>
      </Section>

      <Section title={t("How long", "Per quanto tempo")}>
        <p>
          {t(
            "Your account data is kept until you delete your account (Settings → Account → Delete account), which erases it at once. Shared place names are not personal data and are kept.",
            "I dati del tuo account restano finché non elimini l'account (Impostazioni → Account → Elimina account), che li cancella subito. I nomi dei luoghi condivisi non sono dati personali e vengono conservati.",
          )}
        </p>
      </Section>

      <Section title={t("Your rights", "I tuoi diritti")}>
        <p>
          {t(
            "You can ask to access, correct, export or erase your data, or to restrict or object to its processing (GDPR arts. 15–21). You can erase everything yourself with Delete account, or write to ",
            "Puoi chiedere di accedere ai tuoi dati, correggerli, esportarli o cancellarli, oppure limitarne o opporti al trattamento (artt. 15–21 GDPR). Puoi cancellare tutto da solo con Elimina account, oppure scrivere a ",
          )}
          {mail}.{" "}
          {t(
            "You also have the right to lodge a complaint with a supervisory authority; in Italy, the ",
            "Hai anche il diritto di proporre reclamo a un'autorità di controllo; in Italia, il ",
          )}
          <a
            className="text-primary underline"
            href="https://www.garanteprivacy.it"
            target="_blank"
            rel="noreferrer"
          >
            Garante per la protezione dei dati personali
          </a>
          .
        </p>
      </Section>

      <Section title={t("Garmin data", "Dati Garmin")}>
        <p>
          {t(
            "Activities recorded on Garmin devices are labelled with the device that recorded them, and pages that combine many activities note that they are derived in part from Garmin device-sourced data, as intervals.icu's API terms require.",
            "Le attività registrate con dispositivi Garmin riportano il dispositivo che le ha registrate, e le pagine che combinano più attività indicano che derivano in parte da dati di dispositivi Garmin, come richiesto dai termini dell'API di intervals.icu.",
          )}
        </p>
      </Section>

      <p className="text-xs text-muted-foreground">
        <Link to="/login" className="underline">
          {t("Sign in or create an account", "Accedi o crea un account")}
        </Link>
      </p>
    </article>
  );
}
