import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { useAppContext } from "../hooks/useAppContext";
import { usePolling } from "../hooks/usePolling";
import { CreateCommandInput, DeviceCommandRecord, DeviceItem } from "../types/admin";

function extractUrl(text?: string): string | null {
  if (!text) {
    return null;
  }
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export default function DeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const { api } = useAppContext();

  const [device, setDevice] = useState<DeviceItem | null>(null);
  const [commands, setCommands] = useState<DeviceCommandRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commandError, setCommandError] = useState("");

  const [packageName, setPackageName] = useState("com.sistrun.manager");
  const [serviceName, setServiceName] = useState("core-agent");
  const [logRange, setLogRange] = useState("6h");
  const [profileId, setProfileId] = useState("park-default");
  const [rebootConfirmed, setRebootConfirmed] = useState(false);

  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadDevice = useCallback(async () => {
    if (!deviceId) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await api.getDevice(deviceId);
      setDevice(data);
    } catch (err) {
      setError((err as Error).message || "기기 상세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, deviceId]);

  const loadCommands = useCallback(async () => {
    if (!deviceId) {
      return;
    }
    try {
      const list = await api.listDeviceCommands(deviceId, 50);
      setCommands(list);
    } catch (err) {
      setCommandError((err as Error).message || "명령 로그 조회 실패");
    }
  }, [api, deviceId]);

  useEffect(() => {
    void loadDevice();
    void loadCommands();
  }, [loadCommands, loadDevice]);

  usePolling(() => loadCommands(), 5000, Boolean(deviceId));

  async function runCommand(input: CreateCommandInput, options?: { confirmText?: string }) {
    if (!deviceId) {
      return;
    }

    if (options?.confirmText && !window.confirm(options.confirmText)) {
      return;
    }

    try {
      setActionSubmitting(true);
      setCommandError("");
      await api.createDeviceCommand(deviceId, {
        ...input,
        requestedBy: "super-admin-web"
      });
      await loadCommands();
    } catch (err) {
      const message = (err as Error).message || "명령 생성 실패";
      if (message.includes("INSTITUTION_CONTRACT_DATE_DENIED")) {
        setCommandError("기관 계약 기간 외에는 명령을 전송할 수 없습니다.");
      } else {
        setCommandError(message);
      }
    } finally {
      setActionSubmitting(false);
    }
  }

  function onRestartApp(event: FormEvent) {
    event.preventDefault();
    void runCommand({
      type: "RESTART_APP",
      payload: { packageName }
    });
  }

  function onRestartService(event: FormEvent) {
    event.preventDefault();
    void runCommand({
      type: "RESTART_SERVICE",
      payload: { serviceName }
    });
  }

  const actionable = useMemo(
    () =>
      commands.filter((cmd) => cmd.status === "PENDING" || cmd.status === "RUNNING").length,
    [commands]
  );

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <h3>기기 상세</h3>
          <div className="action-row">
            <button type="button" onClick={() => void loadDevice()} disabled={loading}>
              상태 새로고침
            </button>
            <button type="button" onClick={() => void loadCommands()}>
              명령 로그 새로고침
            </button>
            <Link to="/devices">목록으로</Link>
          </div>
        </div>

        {error && <p className="status">{error}</p>}

        {device ? (
          <div className="info-card">
            <p>deviceId: {device.deviceId}</p>
            <p>deviceName: {device.deviceName || "-"}</p>
            <p>
              status: <StatusBadge status={device.status} />
            </p>
            <p>model/os: {(device.model || "-") + " / " + (device.osVersion || "-")}</p>
            <p>lastSeen: {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "-"}</p>
            <p>
              location: {device.locationName || "-"}
              {Number.isFinite(device.lat) && Number.isFinite(device.lng) && (
                <span className="mono">
                  {" "}
                  (
                  <a href={`https://www.google.com/maps?q=${device.lat},${device.lng}`} target="_blank" rel="noreferrer">
                    {device.lat?.toFixed(5)}, {device.lng?.toFixed(5)}
                  </a>
                  )
                </span>
              )}
            </p>
            <p>
              modules:{" "}
              {device.modules && device.modules.length > 0
                ? device.modules.map((module) => `${module.name}(${module.portNumber})`).join(", ")
                : "-"}
            </p>
            <p>
              소속 기관:{" "}
              {device.activeInstitution ? (
                <>
                  <Link to={`/institutions/${encodeURIComponent(device.activeInstitution.institutionId)}`}>
                    {device.activeInstitution.name}
                  </Link>
                  <span className="muted">
                    {" "}
                    {device.activeInstitution.contractStartDate || device.activeInstitution.contractEndDate
                      ? `계약기간 ${device.activeInstitution.contractStartDate || "시작 미지정"}~${
                          device.activeInstitution.contractEndDate || "종료 미지정"
                        }`
                      : ""}
                  </span>
                </>
              ) : (
                "-"
              )}
            </p>
            <p>
              납품 정보:{" "}
              {device.activeDelivery
                ? `${new Date(device.activeDelivery.deliveredAt).toLocaleString()} / ${
                    device.activeDelivery.installLocation || "설치위치 미입력"
                  }`
                : "-"}
            </p>
            <p>활성 명령: {actionable}개</p>
          </div>
        ) : (
          <p className="empty-text">기기 정보를 불러오는 중입니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>원격 운영 명령 (Top 10)</h3>
        <p className="muted">명령은 api-server 큐에 저장되고 단말 에이전트가 순차 실행합니다.</p>

        <div className="command-grid">
          <form className="mini-form" onSubmit={onRestartApp}>
            <h4>1) 앱 재시작</h4>
            <input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="packageName" />
            <button disabled={actionSubmitting} type="submit">
              RESTART_APP
            </button>
          </form>

          <form className="mini-form" onSubmit={onRestartService}>
            <h4>2) 서비스 재시작</h4>
            <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="serviceName" />
            <button disabled={actionSubmitting} type="submit">
              RESTART_SERVICE
            </button>
          </form>

          <div className="mini-form">
            <h4>3) 헬스체크</h4>
            <button
              disabled={actionSubmitting}
              type="button"
              onClick={() => void runCommand({ type: "RUN_HEALTHCHECK" })}
            >
              RUN_HEALTHCHECK
            </button>
          </div>

          <div className="mini-form">
            <h4>4) 네트워크 진단</h4>
            <button
              disabled={actionSubmitting}
              type="button"
              onClick={() => void runCommand({ type: "DIAG_NETWORK" })}
            >
              DIAG_NETWORK
            </button>
          </div>

          <div className="mini-form">
            <h4>5) 시간 동기화</h4>
            <button disabled={actionSubmitting} type="button" onClick={() => void runCommand({ type: "SYNC_TIME" })}>
              SYNC_TIME
            </button>
          </div>

          <div className="mini-form">
            <h4>6) 로그 수집</h4>
            <input value={logRange} onChange={(event) => setLogRange(event.target.value)} placeholder="예: 6h" />
            <button
              disabled={actionSubmitting}
              type="button"
              onClick={() =>
                void runCommand({
                  type: "COLLECT_LOGS",
                  payload: { range: logRange }
                })
              }
            >
              COLLECT_LOGS
            </button>
          </div>

          <div className="mini-form">
            <h4>7) 스크린샷 요청</h4>
            <button
              disabled={actionSubmitting}
              type="button"
              onClick={() => void runCommand({ type: "CAPTURE_SCREENSHOT" })}
            >
              CAPTURE_SCREENSHOT
            </button>
          </div>

          <div className="mini-form">
            <h4>8) 캐시/프리패치</h4>
            <div className="action-row">
              <button disabled={actionSubmitting} type="button" onClick={() => void runCommand({ type: "CLEAR_CACHE" })}>
                CLEAR_CACHE
              </button>
              <button
                disabled={actionSubmitting}
                type="button"
                onClick={() => void runCommand({ type: "PREFETCH_CONTENT" })}
              >
                PREFETCH_CONTENT
              </button>
            </div>
          </div>

          <div className="mini-form">
            <h4>9) 운영 프로파일 적용</h4>
            <input value={profileId} onChange={(event) => setProfileId(event.target.value)} placeholder="profileId" />
            <button
              disabled={actionSubmitting}
              type="button"
              onClick={() =>
                void runCommand({
                  type: "APPLY_PROFILE",
                  payload: { profileId }
                })
              }
            >
              APPLY_PROFILE
            </button>
          </div>

          <div className="mini-form danger-zone">
            <h4>10) 재부팅 (2단 확인)</h4>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={rebootConfirmed}
                onChange={(event) => setRebootConfirmed(event.target.checked)}
              />
              재부팅 위험성 확인
            </label>
            <button
              disabled={actionSubmitting || !rebootConfirmed}
              type="button"
              onClick={() =>
                void runCommand(
                  {
                    type: "REBOOT",
                    payload: { reason: "web-admin emergency reboot" }
                  },
                  { confirmText: "정말 재부팅 명령을 전송할까요?" }
                )
              }
            >
              REBOOT
            </button>
          </div>
        </div>

        {commandError && <p className="status">{commandError}</p>}
      </section>

      <section className="panel">
        <h3>명령 로그</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>시간</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {commands.length === 0 ? (
                <tr>
                  <td colSpan={5}>명령 로그가 없습니다.</td>
                </tr>
              ) : (
                commands.map((cmd) => {
                  const link = extractUrl(cmd.resultMessage);
                  return (
                    <tr key={cmd.id}>
                      <td className="mono">{cmd.id.slice(0, 8)}</td>
                      <td>{cmd.type}</td>
                      <td>
                        <StatusBadge status={cmd.status} kind="command" />
                      </td>
                      <td>
                        <div>{new Date(cmd.createdAt).toLocaleString()}</div>
                        <div className="muted">업데이트: {new Date(cmd.updatedAt).toLocaleTimeString()}</div>
                      </td>
                      <td>
                        {cmd.resultMessage || "-"}
                        {link && (
                          <div>
                            <a href={link} target="_blank" rel="noreferrer">
                              결과 링크 열기
                            </a>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
