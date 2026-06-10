import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  paperOrderPlanStatusClass,
} from "./dashboardFormat";
import { useDashboardLanguage } from "./dashboardLanguage";
import { DashboardModel } from "./useControlPlaneDashboard";

interface BrokerSnapshotPanelProps {
  model: DashboardModel;
}

export const BrokerSnapshotPanel = ({ model }: BrokerSnapshotPanelProps) => {
  const { t } = useDashboardLanguage();
  const snapshot = model.latestBrokerSnapshot;
  const fill = model.latestBrokerFill;
  const adapter = model.visibleBrokerAdapterStatus;
  const readyCapabilityCount = adapter.capabilities.filter(
    (capability) =>
      capability.status === "ready" || capability.status === "configured",
  ).length;

  return (
    <section className="rounded-xl border border-[#2b3139] bg-[#181a20]">
      <div className="flex flex-col gap-3 border-b border-[#2b3139] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-white">
            {t("Broker Snapshot Monitor")}
          </h3>
          <p className="mt-1 text-xs text-[#707a8a]">
            {t(
              "Read-only broker artifacts. No credentials, order payloads, or callable broker actions are exposed here.",
            )}
          </p>
        </div>
        <span className="rounded-md border border-[#f6465d]/30 bg-[#f6465d]/10 px-2 py-1 text-[11px] font-bold uppercase text-[#f6465d]">
          {t("broker write disabled")}
        </span>
      </div>

      {model.errors.brokerSnapshots && (
        <div className="mx-4 mt-4 rounded-lg border border-[#f0b90b]/30 bg-[#f0b90b]/10 p-3 text-xs font-semibold text-[#fcd535]">
          {model.errors.brokerSnapshots}
        </div>
      )}
      {model.errors.brokerFills && (
        <div className="mx-4 mt-4 rounded-lg border border-[#f0b90b]/30 bg-[#f0b90b]/10 p-3 text-xs font-semibold text-[#fcd535]">
          {model.errors.brokerFills}
        </div>
      )}
      {model.errors.brokerAdapter && (
        <div className="mx-4 mt-4 rounded-lg border border-[#f0b90b]/30 bg-[#f0b90b]/10 p-3 text-xs font-semibold text-[#fcd535]">
          {model.errors.brokerAdapter}
        </div>
      )}

      <div className="border-b border-[#2b3139] p-4">
        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                  {t(model.sources.brokerAdapter)}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-white">
                  {adapter.provider} / {adapter.authMethod}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#707a8a]">
                  {t("credential")} {adapter.credentialRef}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#707a8a]">
                  {t("custody")} {adapter.credentialCustody.secretRef}
                </div>
              </div>
              <span
                className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${
                  adapter.readOnlyEnabled
                    ? "border-[#0ecb81]/40 bg-[#0ecb81]/10 text-[#0ecb81]"
                    : "border-[#f0b90b]/40 bg-[#f0b90b]/10 text-[#fcd535]"
                }`}
              >
                {adapter.readOnlyEnabled ? t("read only ready") : t("blocked")}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {[
                ["configured", adapter.configured ? "yes" : "no"],
                [
                  "custody",
                  adapter.credentialCustody.productionReady
                    ? "external"
                    : adapter.credentialCustody.configured
                      ? "env only"
                      : "missing",
                ],
                [
                  "poller",
                  adapter.readOnlyPoll.enabled
                    ? adapter.readOnlyPoll.lastError
                      ? "error"
                      : "enabled"
                    : "disabled",
                ],
                ["schema", adapter.schemaVerified ? "verified" : "missing"],
                ["live", adapter.liveTradingEnabled ? "enabled" : "off"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-bold uppercase text-[#707a8a]">
                    {t(label)}
                  </div>
                  <div className="mt-1 font-mono font-bold text-[#eaecef]">
                    {t(String(value))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-[#2b3139] bg-[#151a21] p-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold uppercase text-[#707a8a]">
                  {t("Emergency controls")}
                </span>
                <span className="font-mono font-bold text-[#f6465d]">
                  {t("dry run only")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  [
                    "runtime stop",
                    adapter.emergencyControls.runtimeKillSwitchReady
                      ? "ready"
                      : "blocked",
                  ],
                  [
                    "cancel orders",
                    adapter.emergencyControls.brokerCancelReady
                      ? "ready"
                      : "blocked",
                  ],
                  [
                    "flatten positions",
                    adapter.emergencyControls.brokerFlattenReady
                      ? "ready"
                      : "blocked",
                  ],
                  [
                    "open order poll",
                    adapter.emergencyControls.openOrderPollingReady
                      ? "ready"
                      : "blocked",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="font-bold uppercase text-[#707a8a]">
                      {t(String(label))}
                    </div>
                    <div
                      className={`mt-1 font-mono font-bold ${
                        value === "ready" ? "text-[#0ecb81]" : "text-[#f6465d]"
                      }`}
                    >
                      {t(String(value))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[#929aa5]">
                {t(adapter.emergencyControls.detail)}
              </div>
            </div>
            <div className="mt-3 rounded-md border border-[#2b3139] bg-[#151a21] p-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold uppercase text-[#707a8a]">
                  {t("Read-only polling")}
                </span>
                <span
                  className={
                    adapter.readOnlyPoll.canPoll
                      ? "font-mono font-bold text-[#0ecb81]"
                      : "font-mono font-bold text-[#fcd535]"
                  }
                >
                  {adapter.readOnlyPoll.canPoll ? t("can poll") : t("blocked")}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-[#929aa5]">
                <div>
                  {t("cron")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.cron}
                  </span>
                </div>
                <div>
                  {t("last attempt")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastAttemptAt
                      ? formatDateTime(adapter.readOnlyPoll.lastAttemptAt)
                      : t("never")}
                  </span>
                </div>
                <div>
                  {t("last poll")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastPollAt
                      ? formatDateTime(adapter.readOnlyPoll.lastPollAt)
                      : t("never")}
                  </span>
                </div>
                <div>
                  {t("latest snapshot")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastSnapshotId ?? t("none")}
                  </span>
                </div>
                <div>
                  {t("auto reconcile")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {t(
                      adapter.readOnlyPoll.lastReconciliationStatus ??
                        "not_checked",
                    )}
                  </span>
                  {adapter.readOnlyPoll.lastReconciledAt
                    ? ` / ${formatDateTime(
                        adapter.readOnlyPoll.lastReconciledAt,
                      )}`
                    : ""}
                </div>
                {adapter.readOnlyPoll.lastReconciliationError && (
                  <div className="text-[#f0b90b]">
                    {adapter.readOnlyPoll.lastReconciliationError}
                  </div>
                )}
                {adapter.readOnlyPoll.lastError && (
                  <div className="text-[#f6465d]">
                    {adapter.readOnlyPoll.lastError}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-md border border-[#2b3139] bg-[#151a21] p-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold uppercase text-[#707a8a]">
                  {t("Fill polling")}
                </span>
                <span
                  className={
                    adapter.readOnlyPoll.canPollFills
                      ? "font-mono font-bold text-[#0ecb81]"
                      : "font-mono font-bold text-[#fcd535]"
                  }
                >
                  {adapter.readOnlyPoll.canPollFills
                    ? t("can poll")
                    : t("blocked")}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-[#929aa5]">
                <div>
                  {t("schema")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.fillSchemaVerified
                      ? t("verified")
                      : t("missing")}
                  </span>
                </div>
                <div>
                  {t("path")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.fillPathConfigured
                      ? t("configured")
                      : t("missing")}
                  </span>
                </div>
                <div>
                  {t("last fill poll")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastFillPollAt
                      ? formatDateTime(adapter.readOnlyPoll.lastFillPollAt)
                      : t("never")}
                  </span>
                </div>
                <div>
                  {t("latest fills")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastBrokerFillIds?.join(", ") ??
                      t("none")}
                  </span>
                </div>
                <div>
                  {t("latest order statuses")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {adapter.readOnlyPoll.lastBrokerOrderStatusIds?.join(
                      ", ",
                    ) ?? t("none")}
                  </span>
                </div>
                <div>
                  {t("fill reconcile")}{" "}
                  <span className="font-mono text-[#eaecef]">
                    {t(
                      adapter.readOnlyPoll.lastFillReconciliationStatus ??
                        "not_checked",
                    )}
                  </span>
                  {adapter.readOnlyPoll.lastFillReconciledAt
                    ? ` / ${formatDateTime(
                        adapter.readOnlyPoll.lastFillReconciledAt,
                      )}`
                    : ""}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                {t("Broker adapter gates")}
              </div>
              <div className="font-mono text-[11px] font-bold text-[#eaecef]">
                {readyCapabilityCount}/{adapter.capabilities.length}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {adapter.capabilities.map((capability) => (
                <div
                  key={capability.key}
                  className="flex items-center justify-between gap-2 rounded-md border border-[#2b3139] px-2 py-1.5 text-xs"
                >
                  <span className="truncate text-[#929aa5]">
                    {capability.key}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      capability.status === "ready" ||
                      capability.status === "configured"
                        ? "text-[#0ecb81]"
                        : "text-[#f6465d]"
                    }`}
                  >
                    {t(capability.status)}
                  </span>
                </div>
              ))}
            </div>
            {adapter.blockers.length > 0 && (
              <div className="mt-3 rounded-md border border-[#f6465d]/30 bg-[#f6465d]/10 p-2">
                <div className="mb-1 text-[11px] font-bold uppercase text-[#f6465d]">
                  {t("Broker blockers")}
                </div>
                <div className="space-y-1 text-xs text-[#eaecef]">
                  {adapter.blockers.map((blocker) => (
                    <div key={blocker} className="font-mono">
                      {blocker}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {snapshot ? (
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-[#2b3139] p-4 lg:border-r lg:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                  {t(model.sources.brokerSnapshots)}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-white">
                  {snapshot.provider} / {snapshot.sourceRef ?? "read-only"}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#707a8a]">
                  {snapshot.id}
                </div>
              </div>
              <span
                className={`${paperOrderPlanStatusClass(snapshot.status)} rounded-md border px-2 py-1 text-[11px] font-bold uppercase`}
              >
                {snapshot.status}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["Cash", formatCurrency(snapshot.cash, snapshot.currency)],
                ["Equity", formatCurrency(snapshot.equity, snapshot.currency)],
                ["Exposure", `${formatNumber(snapshot.grossExposurePct)}%`],
                ["Positions", `${snapshot.positions.length}`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3"
                >
                  <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                    {label}
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-white">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-[#707a8a]">
              {t("As of")}{" "}
              <span className="font-mono text-[#eaecef]">
                {formatDateTime(snapshot.asOf)}
              </span>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Cash", matched: snapshot.reconciliation.cashMatched },
                {
                  label: "Equity",
                  matched: snapshot.reconciliation.equityMatched,
                },
                {
                  label: "Positions",
                  matched: snapshot.reconciliation.positionsMatched,
                },
              ].map(({ label, matched }) => (
                <div
                  key={label}
                  className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3"
                >
                  <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                    {t(label)}
                  </div>
                  <div
                    className={`mt-1 font-mono text-sm font-bold ${
                      matched ? "text-[#0ecb81]" : "text-[#f6465d]"
                    }`}
                  >
                    {matched ? t("matched") : t("open")}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 divide-y divide-[#2b3139] rounded-lg border border-[#2b3139] bg-[#0b0e11] text-xs">
              {[
                ["cashDiff", snapshot.reconciliation.cashDiff ?? 0],
                ["equityDiff", snapshot.reconciliation.equityDiff ?? 0],
                ["tolerance", snapshot.reconciliation.tolerance],
                ["maxAgeMinutes", snapshot.reconciliation.maxAgeMinutes],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 p-3">
                  <span className="text-[#707a8a]">{t(String(label))}</span>
                  <span className="font-mono font-bold text-[#eaecef]">
                    {typeof value === "number" ? formatNumber(value) : value}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 max-h-24 space-y-1 overflow-auto text-xs text-[#929aa5]">
              {snapshot.reconciliation.notes.slice(-3).map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-[#929aa5]">
          {t("No broker read-only snapshot has been imported yet.")}
        </div>
      )}

      <div className="border-t border-[#2b3139] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase text-[#707a8a]">
              {t(model.sources.brokerFills)}
            </div>
            <h4 className="mt-1 text-sm font-bold text-white">
              {t("Broker Fill Evidence")}
            </h4>
          </div>
          <div className="font-mono text-xs font-bold text-[#eaecef]">
            {model.visibleBrokerFills.length} {t("fills")}
          </div>
        </div>

        {fill ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              {[
                ["Symbol", fill.symbol],
                ["Side", fill.side],
                ["Notional", formatCurrency(fill.grossNotional, fill.currency)],
                ["Recon", fill.reconciliation.status],
              ].map(([label, value]) => (
                <BrokerFillMetric key={label} label={label} value={value} />
              ))}
            </div>
            <div className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase text-[#707a8a]">
                    {t("Paper Match")}
                  </div>
                  <div className="mt-1 truncate font-mono text-sm font-bold text-[#eaecef]">
                    {fill.reconciliation.paperOrderPlanId
                      ? `${t("plan")} ${fill.reconciliation.paperOrderPlanId}`
                      : t("no plan")}{" "}
                    / {fill.reconciliation.paperFillId ?? t("no fill")}
                  </div>
                </div>
                <div className="font-mono text-xs font-bold text-[#929aa5]">
                  {t("checked")}{" "}
                  {fill.reconciliation.checkedAt
                    ? formatDateTime(fill.reconciliation.checkedAt)
                    : t("not yet")}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                {[
                  [
                    "Qty diff",
                    formatNumber(fill.reconciliation.quantityDiff ?? 0),
                  ],
                  [
                    "Notional diff",
                    formatCurrency(fill.reconciliation.notionalDiff ?? 0),
                  ],
                  [
                    "Fee diff",
                    formatCurrency(fill.reconciliation.feeDiff ?? 0),
                  ],
                ].map(([label, value]) => (
                  <BrokerFillMetric key={label} label={label} value={value} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["symbol", fill.reconciliation.symbolMatched],
                    ["side", fill.reconciliation.sideMatched],
                    ["quantity", fill.reconciliation.quantityMatched],
                    ["notional", fill.reconciliation.notionalMatched],
                    ["fee", fill.reconciliation.feeMatched],
                  ] as [string, boolean][]
                ).map(([label, matched]) => (
                  <span
                    key={label}
                    className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase ${
                      matched
                        ? "border-[#0ecb81]/30 bg-[#0ecb81]/10 text-[#0ecb81]"
                        : "border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d]"
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1">
                {fill.reconciliation.notes.slice(-2).map((note) => (
                  <div key={note} className="text-xs leading-5 text-[#929aa5]">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3 text-xs font-semibold text-[#707a8a]">
            {t("No broker read-only fill report has been imported yet.")}
          </div>
        )}
      </div>
    </section>
  );
};

const BrokerFillMetric = ({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined;
}) => {
  const { t } = useDashboardLanguage();

  return (
    <div className="rounded-lg border border-[#2b3139] bg-[#0b0e11] p-3">
      <div className="text-[11px] font-bold uppercase text-[#707a8a]">
        {t(label)}
      </div>
      <div className="mt-1 truncate font-mono text-sm font-bold text-[#eaecef]">
        {value ?? "n/a"}
      </div>
    </div>
  );
};
