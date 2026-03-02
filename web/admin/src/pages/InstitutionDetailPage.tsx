import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import {
  InstitutionActionLog,
  InstitutionDelivery,
  InstitutionDetail,
  UnassignedDeviceItem
} from "../types/admin";

type TabKey = "summary" | "deliveries" | "logs";

export default function InstitutionDetailPage() {
  const { institutionId = "" } = useParams();
  const { api } = useAppContext();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("summary");
  const [institution, setInstitution] = useState<InstitutionDetail | null>(null);
  const [deliveries, setDeliveries] = useState<InstitutionDelivery[]>([]);
  const [logs, setLogs] = useState<InstitutionActionLog[]>([]);
  const [unassignedDevices, setUnassignedDevices] = useState<UnassignedDeviceItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deliveredAtLocal, setDeliveredAtLocal] = useState(() => new Date().toISOString().slice(0, 16));
  const [installLocation, setInstallLocation] = useState("");
  const [deliveryMemo, setDeliveryMemo] = useState("");

  const loadInstitution = useCallback(async () => {
    if (!institutionId) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const detail = await api.getInstitution(institutionId);
      setInstitution(detail);
    } catch (err) {
      setError((err as Error).message || "기관 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, institutionId]);

  const loadDeliveries = useCallback(async () => {
    if (!institutionId) {
      return;
    }
    const list = await api.listInstitutionDeliveries(institutionId);
    setDeliveries(list);
  }, [api, institutionId]);

  const loadLogs = useCallback(async () => {
    if (!institutionId) {
      return;
    }
    const list = await api.listInstitutionLogs(institutionId, { limit: 200 });
    setLogs(list);
  }, [api, institutionId]);

  const loadUnassignedDevices = useCallback(async () => {
    const list = await api.listUnassignedDevices({ limit: 200 });
    setUnassignedDevices(list);
    if (list.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(list[0].deviceId);
    }
  }, [api, selectedDeviceId]);

  useEffect(() => {
    void loadInstitution();
    void loadDeliveries();
    void loadLogs();
    void loadUnassignedDevices();
  }, [loadDeliveries, loadInstitution, loadLogs, loadUnassignedDevices]);

  const activeDeliveries = useMemo(() => deliveries.filter((item) => item.status === "ACTIVE"), [deliveries]);
  const endedDeliveries = useMemo(() => deliveries.filter((item) => item.status === "ENDED"), [deliveries]);

  async function registerDelivery(event: FormEvent) {
    event.preventDefault();
    if (!institutionId || !selectedDeviceId) {
      return;
    }

    try {
      setSubmitting(true);
      setActionError("");
      await api.createInstitutionDelivery({
        institutionId,
        deviceId: selectedDeviceId,
        deliveredAt: deliveredAtLocal ? new Date(deliveredAtLocal).toISOString() : undefined,
        installLocation: installLocation.trim() || undefined,
        memo: deliveryMemo.trim() || undefined
      });
      setInstallLocation("");
      setDeliveryMemo("");
      await loadDeliveries();
      await loadLogs();
      await loadUnassignedDevices();
    } catch (err) {
      const message = (err as Error).message || "납품 등록에 실패했습니다.";
      if (message.includes("DEVICE_ALREADY_DELIVERED")) {
        setActionError("이미 납품중인 기기입니다.");
      } else {
        setActionError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function endDelivery(deliveryId: string) {
    if (!institutionId) {
      return;
    }
    if (!window.confirm("해당 납품을 종료하시겠습니까?")) {
      return;
    }

    try {
      setSubmitting(true);
      setActionError("");
      await api.endInstitutionDelivery({
        institutionId,
        deliveryId,
        retrievedAt: new Date().toISOString()
      });
      await loadDeliveries();
      await loadLogs();
      await loadUnassignedDevices();
    } catch (err) {
      setActionError((err as Error).message || "납품 종료에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="empty-text">기관 정보를 불러오는 중입니다.</p>
      </section>
    );
  }

  if (!institution) {
    return (
      <section className="panel">
        <p className="status danger-text">{error || "기관을 찾을 수 없습니다."}</p>
        <div className="action-row">
          <Link to="/institutions">목록으로</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <h3>기관 상세</h3>
          <div className="action-row">
            <button type="button" onClick={() => void loadInstitution()} disabled={loading}>
              새로고침
            </button>
            <button type="button" onClick={() => navigate(`/institutions/${encodeURIComponent(institution.id)}/edit`)}>
              수정
            </button>
            <Link to="/institutions">목록으로</Link>
          </div>
        </div>

        <div className="action-row">
          <button type="button" onClick={() => setTab("summary")} disabled={tab === "summary"}>
            기본정보
          </button>
          <button type="button" onClick={() => setTab("deliveries")} disabled={tab === "deliveries"}>
            납품 이력
          </button>
          <button type="button" onClick={() => setTab("logs")} disabled={tab === "logs"}>
            액션 로그
          </button>
        </div>

        {tab === "summary" ? (
          <div className="info-card">
            <p>기관명: {institution.name}</p>
            <p>타입/상태: {institution.institutionTypeName} / {institution.status}</p>
            <p>담당자/연락처: {(institution.contactName || "-") + " / " + (institution.contactPhone || "-")}</p>
            <p>주소: {(institution.addressRoad || "-") + " " + (institution.addressDetail || "")}</p>
            <p>
              계약기간:{" "}
              {institution.contractStartDate || institution.contractEndDate
                ? `${institution.contractStartDate || "시작 미지정"} ~ ${
                    institution.contractEndDate || "종료 미지정"
                  }`
                : "제한 없음"}
            </p>
            <p>납품중 기기: {institution.activeDeviceCount}</p>
            <p>메모: {institution.memo || "-"}</p>
            <p>수정일: {new Date(institution.updatedAt).toLocaleString()}</p>
          </div>
        ) : null}

        {tab === "deliveries" ? (
          <>
            <div className="info-card">
              <form className="grid-form" onSubmit={registerDelivery}>
                <label className="wide">
                  기관 미할당 기기
                  <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}>
                    {unassignedDevices.length === 0 ? (
                      <option value="">납품 가능한 기기가 없습니다.</option>
                    ) : (
                      unassignedDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.deviceId} / {device.deviceType || "-"} / {device.modelName || "-"}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  납품일시
                  <input
                    type="datetime-local"
                    value={deliveredAtLocal}
                    onChange={(event) => setDeliveredAtLocal(event.target.value)}
                  />
                </label>
                <label>
                  설치 위치
                  <input
                    value={installLocation}
                    onChange={(event) => setInstallLocation(event.target.value)}
                    placeholder="운동장 입구 A존"
                  />
                </label>
                <label className="wide">
                  메모
                  <input value={deliveryMemo} onChange={(event) => setDeliveryMemo(event.target.value)} />
                </label>
                <div className="wide action-row">
                  <button type="submit" className="primary-button" disabled={submitting || !selectedDeviceId}>
                    납품 등록
                  </button>
                </div>
              </form>
            </div>

            <h4>납품중 기기</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>deviceId</th>
                    <th>타입</th>
                    <th>납품일</th>
                    <th>설치위치</th>
                    <th>메모</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6}>납품중 기기가 없습니다.</td>
                    </tr>
                  ) : (
                    activeDeliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td className="mono">
                          <Link to={`/devices/${encodeURIComponent(delivery.deviceId)}`}>{delivery.deviceId}</Link>
                        </td>
                        <td>{delivery.deviceTypeSnapshot || "-"}</td>
                        <td>{new Date(delivery.deliveredAt).toLocaleString()}</td>
                        <td>{delivery.installLocation || "-"}</td>
                        <td>{delivery.memo || "-"}</td>
                        <td>
                          <button type="button" onClick={() => void endDelivery(delivery.id)} disabled={submitting}>
                            납품 종료
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h4>종료 이력</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>deviceId</th>
                    <th>타입</th>
                    <th>납품일</th>
                    <th>종료일</th>
                    <th>설치위치</th>
                    <th>메모</th>
                  </tr>
                </thead>
                <tbody>
                  {endedDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6}>종료된 이력이 없습니다.</td>
                    </tr>
                  ) : (
                    endedDeliveries.map((delivery) => (
                      <tr key={delivery.id}>
                        <td className="mono">{delivery.deviceId}</td>
                        <td>{delivery.deviceTypeSnapshot || "-"}</td>
                        <td>{new Date(delivery.deliveredAt).toLocaleString()}</td>
                        <td>{delivery.retrievedAt ? new Date(delivery.retrievedAt).toLocaleString() : "-"}</td>
                        <td>{delivery.installLocation || "-"}</td>
                        <td>{delivery.memo || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "logs" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>액션</th>
                  <th>대상기기</th>
                  <th>수행자</th>
                  <th>payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>로그가 없습니다.</td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.actedAt).toLocaleString()}</td>
                      <td>{log.actionType}</td>
                      <td className="mono">{log.deviceId || "-"}</td>
                      <td>{log.actedBy}</td>
                      <td className="mono">{log.actionPayload ? JSON.stringify(log.actionPayload) : "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {actionError ? <p className="status danger-text">{actionError}</p> : null}
      </section>
    </div>
  );
}
