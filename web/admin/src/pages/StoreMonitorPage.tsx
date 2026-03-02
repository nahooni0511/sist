import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { usePolling } from "../hooks/usePolling";
import { StoreDeviceSummary, StoreUpdateEvent } from "../types/admin";

export default function StoreMonitorPage() {
  const { api } = useAppContext();

  const [devices, setDevices] = useState<StoreDeviceSummary[]>([]);
  const [events, setEvents] = useState<StoreUpdateEvent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [nextDevices, nextEvents] = await Promise.all([
        api.listStoreDevices({ query: query.trim() || undefined }),
        api.listStoreEvents({ limit: 60 })
      ]);
      setDevices(nextDevices);
      setEvents(nextEvents);
    } catch (e) {
      setError((e as Error).message || "앱스토어 모니터 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, query]);

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(() => load(), 10000, true);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-head">
          <h3>앱스토어 백그라운드 동기화</h3>
          <button type="button" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        </div>

        <form className="inline-filters" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="deviceId / model / platform 검색"
          />
          <button type="submit" className="primary-button" disabled={loading}>
            검색
          </button>
        </form>

        {error ? <p className="status">{error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>deviceId</th>
                <th>model/platform</th>
                <th>마지막 동기화</th>
                <th>설치앱</th>
                <th>업데이트</th>
                <th>최근 이벤트</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={6}>표시할 데이터가 없습니다.</td>
                </tr>
              ) : (
                devices.map((item) => (
                  <tr key={item.deviceId}>
                    <td>
                      <Link to={`/store/devices/${encodeURIComponent(item.deviceId)}`}>{item.deviceId}</Link>
                    </td>
                    <td>
                      {(item.modelName || "-") + " / " + (item.platform || "-")}
                      <div className="muted mono">{item.osVersion || "-"}</div>
                    </td>
                    <td>{item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleString() : "-"}</td>
                    <td>{item.installedPackageCount}</td>
                    <td>{item.availableUpdateCount}</td>
                    <td>
                      {item.latestEventType || "-"}
                      <div className="muted mono">
                        {item.latestEventAt ? new Date(item.latestEventAt).toLocaleString() : "-"}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>최근 업데이트 이벤트</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>deviceId</th>
                <th>패키지</th>
                <th>이벤트</th>
                <th>상태</th>
                <th>메시지</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6}>이벤트가 없습니다.</td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.createdAt).toLocaleString()}</td>
                    <td>
                      <Link to={`/store/devices/${encodeURIComponent(event.deviceId)}`}>{event.deviceId}</Link>
                    </td>
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
