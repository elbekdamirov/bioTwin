import type { Profile } from "./model";
import type { Translate } from "./ProfileEditor";

export function PatientDataFields({
  profile,
  change,
  t,
}: {
  profile: Profile;
  change: (p: Profile) => void;
  t: Translate;
}) {
  const g = profile.genetics;
  const update = (value: Partial<Profile["genetics"]>) =>
    change({ ...profile, genetics: { ...g, ...value } });
  return (
    <>
      <fieldset className="forecast-fields">
        <legend>{t("Medicine records", "Dori ma’lumotlari")}</legend>
        <label>
          {t(
            "Drug allergies · comma separated names",
            "Dori allergiyalari · vergul bilan",
          )}
          <input
            maxLength={250}
            value={profile.drugAllergies}
            onChange={(e) =>
              change({ ...profile, drugAllergies: e.target.value })
            }
          />
        </label>
        <label>
          {t("Current medicines and doses", "Joriy dorilar va dozalar")}
          <textarea
            maxLength={1000}
            value={profile.currentMedicines}
            onChange={(e) =>
              change({ ...profile, currentMedicines: e.target.value })
            }
          />
        </label>
      </fieldset>
      <fieldset className="forecast-fields">
        <legend>{t("Lab results", "Tahlillar")}</legend>
        <label>
          {t(
            "Additional results, units and dates",
            "Qo‘shimcha natijalar, birliklar va sanalar",
          )}
          <textarea
            maxLength={2000}
            value={profile.labNotes}
            onChange={(e) => change({ ...profile, labNotes: e.target.value })}
          />
        </label>
        <p className="muted">
          {t(
            "Use the forecast fields for HbA1c, LDL, eGFR and albuminuria used by the risk model.",
            "Xavf modelidagi HbA1c, LDL, eGFR va albuminuriya uchun prognoz maydonlarini to‘ldiring.",
          )}
        </p>
      </fieldset>
      <fieldset className="forecast-fields">
        <legend>{t("Lifestyle", "Turmush tarzi")}</legend>
        <label>
          {t(
            "Diet, sleep, alcohol and activity notes",
            "Ovqatlanish, uyqu, alkogol va faollik",
          )}
          <textarea
            maxLength={2000}
            value={profile.lifestyleNotes}
            onChange={(e) =>
              change({ ...profile, lifestyleNotes: e.target.value })
            }
          />
        </label>
      </fieldset>
      <fieldset className="forecast-fields">
        <legend>{t("Genetics", "Genetika")}</legend>
        <label>
          {t("Genetic test status", "Genetik tahlil holati")}
          <select
            value={g.status}
            onChange={(e) =>
              update({ status: e.target.value as typeof g.status })
            }
          >
            <option value="not-tested">
              {t("Not tested", "Tekshirilmagan")}
            </option>
            <option value="pending">{t("Pending", "Kutilmoqda")}</option>
            <option value="available">
              {t("Result available", "Natija mavjud")}
            </option>
          </select>
        </label>
        {(["gene", "variant", "source", "familyHistory"] as const).map(
          (key, i) => (
            <label key={key}>
              {
                [
                  t("Gene symbol", "Gen belgisi"),
                  t("Variant / HGVS", "Variant / HGVS"),
                  t(
                    "Laboratory / report reference",
                    "Laboratoriya / hisobot manbasi",
                  ),
                  t("Family history", "Oilaviy kasallik tarixi"),
                ][i]
              }
              <input
                maxLength={
                  key === "gene"
                    ? 80
                    : key === "variant"
                      ? 200
                      : key === "source"
                        ? 250
                        : 1000
                }
                value={g[key]}
                onChange={(e) => update({ [key]: e.target.value })}
              />
            </label>
          ),
        )}
        <label>
          {t("Laboratory classification", "Laboratoriya tasnifi")}
          <select
            value={g.classification}
            onChange={(e) =>
              update({
                classification: e.target.value as typeof g.classification,
              })
            }
          >
            {[
              "unknown",
              "benign",
              "likely-benign",
              "uncertain",
              "likely-pathogenic",
              "pathogenic",
            ].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {t(
            "Record the laboratory finding. Variants are not interpreted automatically. Genetics is not an input to the Steno risk equation.",
            "Laboratoriya xulosasini qayd eting. Variantlar avtomatik talqin qilinmaydi. Genetika Steno xavf tenglamasiga kirmaydi.",
          )}
        </p>
      </fieldset>
    </>
  );
}

export function PatientDataSummary({
  profile: p,
  t,
}: {
  profile: Profile;
  t: Translate;
}) {
  const empty = t("Not recorded", "Kiritilmagan");
  return (
    <div className="patient-data-summary">
      <h3>{t("Medicine records", "Dori ma’lumotlari")}</h3>
      <p>
        {t("Allergies", "Allergiyalar")}: {p.drugAllergies || empty}
      </p>
      <p>
        {t("Current medicines", "Joriy dorilar")}: {p.currentMedicines || empty}
      </p>
      <h3>{t("Medical history", "Kasallik tarixi")}</h3>
      <p>{p.history || empty}</p>
      <h3>{t("Lab results", "Tahlillar")}</h3>
      <p>
        {p.lab !== "" ? `${p.lab} mmol/L · ` : ""}
        {p.labNotes || empty}
      </p>
      <h3>{t("Lifestyle", "Turmush tarzi")}</h3>
      <p>
        {p.activity} · {p.lifestyleNotes || empty}
      </p>
      <h3>{t("Genetics", "Genetika")}</h3>
      <dl className="facts">
        {Object.entries(p.genetics).map(([k, v]) => (
          <div key={k}>
            <dt>
              {
                (
                  {
                    status: t("Test status", "Tahlil holati"),
                    gene: t("Gene", "Gen"),
                    variant: "Variant / HGVS",
                    classification: t(
                      "Laboratory classification",
                      "Laboratoriya tasnifi",
                    ),
                    source: t("Report reference", "Hisobot manbasi"),
                    familyHistory: t("Family history", "Oilaviy tarix"),
                  } as Record<string, string>
                )[k]
              }
            </dt>
            <dd>{v || empty}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {t(
          "Genetic findings are recorded context and do not change the current risk model.",
          "Genetik natijalar qo‘shimcha ma’lumot bo‘lib, joriy xavf modelini o‘zgartirmaydi.",
        )}
      </p>
    </div>
  );
}
