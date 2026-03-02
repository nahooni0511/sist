import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { usePolling } from "../hooks/usePolling";
import { StoreDeviceDetail } from "../types/admin";

export default function StoreDeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const { api } = useAppContext();

  const [detail, setDetail] = useState<StoreDeviceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!deviceId) {
      return;
    }
    try {
      setLoading(true);
      setError("");
      const nextDetail = await api.getStoreDevice(deviceId);
      setDetail(nextDetail);
    } catch (e) {
      setError((e as Error).message || "상세 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(() => load(), 10000, Boolean(deviceId));

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <h3>앱스토어 디바이스 상세</h3>
          <div className="action-row">
            <button type="button" onClick={() => void load()} disabled={loading}>
              새로고침
            </button>
            <Link to="/store">목록으로</Link>
          </div>
        </div>

        {error ? <p className="status">{error}</p> : null}

        {detail ? (
          <div className="info-card">
            <p>deviceId: {detail.deviceId}</p>
            <p>model/platform: {(detail.modelName || "-") + " / " + (detail.platform || "-")}</p>
            <p>osVersion: {detail.osVersion || "-"}</p>
            <p>appStoreVersion: {detail.appStoreVersion || "-"}</p>
            <p>ipAddress: {detail.ipAddress || "-"}</p>
            <p>lastSyncedAt: {detail.lastSyncedAt ? new Date(detail.lastSyncedAt).toLocaleString() : "-"}</p>
            <p>설치 앱 수: {detail.installedPackageCount}</p>
            <p>업데이트 필요 수: {detail.availableUpdateCount}</p>
          </div>
        ) : (
          <p className="empty-text">상세 데이터가 없습니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>설치 앱 버전</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>패키지</th>
                <th>버전</th>
                <th>동기화 시각</th>
              </tr>
            </thead>
            <tbody>
              {!detail || detail.packages.length === 0 ? (
                <tr>
                  <td colSpan={3}>설치 앱 정보가 없습니다.</td>
                </tr>
              ) : (
                detail.packages.map((pkg) => (
                  <tr key={pkg.packageName}>
                    <td>{pkg.packageName}</td>
                    <td>
                      {pkg.versionName || "-"} ({pkg.versionCode})
                    </td>
                    <td>{pkg.syncedAt ? new Date(pkg.syncedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>최근 동기화 로그</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>패키지 수</th>
                <th>업데이트 수</th>
                <th>앱 버전/IP</th>
              </tr>
            </thead>
            <tbody>
              {!detail || detail.recentSyncs.length === 0 ? (
                <tr>
                  <td colSpan={4}>동기화 로그가 없습니다.</td>
                </tr>
              ) : (
                detail.recentSyncs.map((sync) => (
                  <tr key={sync.id}>
                    <td>{new Date(sync.syncedAt).toLocaleString()}</td>
                    <td>{sync.packageCount}</td>
                    <td>{sync.updateCount}</td>
                    <td>
                      {(sync.appStoreVersion || "-") + " / " + (sync.ipAddress || "-")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>최근 이벤트</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>패키지</th>
                <th>이벤트</th>
                <th>상태</th>
                <th>메시지</th>
              </tr>
            </thead>
            <tbody>
              {!detail || detail.recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={5}>이벤트가 없습니다.</td>
                </tr>
              ) : (
                detail.recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.createdAt).toLocaleString()}</td>
                    <td>{event.packageName}</td>
                    <td>{event.eventType}</td>
                    <td>{event.status}</td>
                    <td>{event.message || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
