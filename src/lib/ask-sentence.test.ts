import { describe, expect, it } from "vitest";
import { command, correctCommand, simplify } from "./ask-sentence";

describe("sentences into phrases", () => {
  it.each([
    ["quanti km ho fatto a settembre 2025", "km settembre 2025"],
    ["Qual è il mio miglior 20 min?", "miglior 20 min"],
    ["quando ho fatto l'ultima uscita", "ultima uscita"],
    ["quante volte ho fatto il mortirolo", "quante volte mortirolo"],
    ["settembre 2025 km", "km settembre 2025"],
    ["how many km in september 2025", "km september 2025"],
    ["what was my best 5 min", "best 5 min"],
    ["how many times did i do verdana", "how many times verdana"],
    ["quanti km ho corso a ottobre", "km corsa ottobre"],
    ["quanto ho pedalato a ottobre", "ore bici ottobre"],
    ["quante uscite ho fatto quest'anno", "uscite quest'anno"],
    ["cosa ho fatto ieri", "ieri"],
    ["qual è il mio miglior 5 min di sempre", "miglior 5 min di sempre"],
  ])("%s", (typed, said) => {
    expect(simplify(typed)).toBe(said);
  });

  it("keeps a range's own words and time ahead", () => {
    expect(simplify("quanti km da marzo a giugno 2025")).toBe("km da marzo a giugno 2025");
    expect(simplify("cosa c'è in 3 giorni")).toContain("in 3 giorni");
  });

  it("leaves what writes alone", () => {
    expect(simplify("pianifica il giro a sabato")).toBe("pianifica il giro a sabato");
    expect(simplify("togli la seduta di sabato")).toBe("togli la seduta di sabato");
    expect(simplify("peso 70")).toBe("peso 70");
  });
});

describe("one slip on a command word", () => {
  it("corrects it and keeps the rest as typed", () => {
    expect(correctCommand("pianfica sabato Giro con Marco")).toBe(
      "pianifica sabato Giro con Marco",
    );
    expect(correctCommand("regista 1h palestra")).toBe("registra 1h palestra");
    expect(correctCommand("migliore 5 min")).toBeNull();
    expect(correctCommand("banana split")).toBeNull();
  });
});

describe("a number on its way to a decimal", () => {
  it.each([
    ["peso 68.", "peso 68"],
    ["peso 68,", "peso 68"],
    ["peso 68 .", "peso 68"],
    ["peso 68.2", "peso 68.2"],
    ["peso 68,2", "peso 68,2"],
    ["quanti km ho fatto.", "quanti km ho fatto"],
  ])("%s reads as %s", (typed, read) => {
    expect(command(typed)).toBe(read);
  });
});
