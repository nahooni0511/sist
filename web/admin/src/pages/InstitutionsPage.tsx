import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import { InstitutionStatus, InstitutionSummary, InstitutionTypeCode } from "../types/admin";

export default function InstitutionsPage() {
  const { api } = useAppContext();
  const [items, setItems] = useState<InstitutionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [typeCode, setTypeCode] = useState<InstitutionTypeCode | "">("");
  const [status, setStatus] = useState<InstitutionStatus | "">("");
  const [hasActiveDevices, setHasActiveDevices] = useState<"" | "true" | "false">("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await api.listInstitutions({
        query: query.trim() || undefined,
        typeCode: typeCode || undefined,
        status: status || undefined,
        hasActiveDevices: hasActiveDevices === "" ? undefined : hasActiveDevices === "true",
        size: 200
      });
      setItems(result);
    } catch (err) {
      setError((err as Error).message || "기관 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api, hasActiveDevices, query, status, typeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>기관관리</h3>
        <div className="action-row">
          <button type="button" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
          <Link to="/institutions/logs">전체 로그</Link>
          <Link to="/institutions/new">기관 등록</Link>
        </div>
      </div>

      <form className="grid-form" onSubmit={onSearch}>
        <label className="wide">
          검색
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="기관명 / 담당자 / 연락처"
          />
        </label>
        <label>
          타입
          <select value={typeCode} onChange={(event) => setTypeCode(event.target.value as InstitutionTypeCode | "")}>
            <option value="">전체</option>
            <option value="SCHOOL">학교</option>
            <option value="PARK">공원</option>
          </select>
        </label>
        <label>
          상태
          <select value={status} onChange={(event) => setStatus(event.target.value as InstitutionStatus | "")}>
            <option value="">전체</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="PENDING">PENDING</option>
          </select>
        </label>
        <label>
          납품중 기기
          <select value={hasActiveDevices} onChange={(event) => setHasActiveDevices(event.target.value as "" | "true" | "false")}>
            <option value="">전체</option>
            <option value="true">있음</option>
            <option value="false">없음</option>
          </select>
        </label>
        <div className="wide action-row">
          <button type="submit" className="primary-button" disabled={loading}>
            검색
          </button>
        </div>
      </form>

      {error ? <p className="status danger-text">{error}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>기관명</th>
              <th>타입</th>
              <th>상태</th>
              <th>담당자</th>
              <th>연락처</th>
              <th>납품중</th>
              <th>수정일</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8}>표시할 기관이 없습니다.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.institutionTypeName}</td>
                  <td>{item.status}</td>
                  <td>{item.contactName || "-"}</td>
                  <td>{item.contactPhone || "-"}</td>
                  <td>{item.activeDeviceCount}</td>
                  <td>{new Date(item.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="action-row">
                      <Link to={`/institutions/${encodeURIComponent(item.id)}`}>상세</Link>
                      <Link to={`/institutions/${encodeURIComponent(item.id)}/edit`}>수정</Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
