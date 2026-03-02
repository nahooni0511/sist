import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../hooks/useAppContext";
import {
  InstitutionDetail,
  InstitutionFieldDataType,
  InstitutionFieldValue,
  InstitutionStatus,
  InstitutionTypeCode,
  InstitutionTypeField,
  UpsertInstitutionInput
} from "../types/admin";

type Props = {
  mode: "create" | "edit";
};

function fieldValueToInput(value: InstitutionFieldValue): string | boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function parseFieldInput(dataType: InstitutionFieldDataType, value: string | boolean): InstitutionFieldValue {
  if (dataType === "BOOLEAN") {
    return Boolean(value);
  }
  if (dataType === "NUMBER") {
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function InstitutionFormPage({ mode }: Props) {
  const { api } = useAppContext();
  const navigate = useNavigate();
  const { institutionId = "" } = useParams();

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [typeCode, setTypeCode] = useState<InstitutionTypeCode>("SCHOOL");
  const [status, setStatus] = useState<InstitutionStatus>("ACTIVE");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [addressRoad, setAddressRoad] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [memo, setMemo] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [schoolAdminLoginId, setSchoolAdminLoginId] = useState("");
  const [schoolAdminPassword, setSchoolAdminPassword] = useState("");

  const [typeFields, setTypeFields] = useState<InstitutionTypeField[]>([]);
  const [fieldInputs, setFieldInputs] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (mode !== "edit" || !institutionId) {
      return;
    }

    let mounted = true;
    setLoading(true);
    setError("");

    void api
      .getInstitution(institutionId)
      .then((detail: InstitutionDetail) => {
        if (!mounted) {
          return;
        }
        setName(detail.name);
        setTypeCode(detail.institutionTypeCode);
        setStatus(detail.status);
        setContactName(detail.contactName || "");
        setContactPhone(detail.contactPhone || "");
        setAddressRoad(detail.addressRoad || "");
        setAddressDetail(detail.addressDetail || "");
        setLat(typeof detail.lat === "number" ? String(detail.lat) : "");
        setLng(typeof detail.lng === "number" ? String(detail.lng) : "");
        setMemo(detail.memo || "");
        setContractStartDate(detail.contractStartDate || "");
        setContractEndDate(detail.contractEndDate || "");

        const nextInputs: Record<string, string | boolean> = {};
        for (const [key, value] of Object.entries(detail.fields || {})) {
          nextInputs[key] = fieldValueToInput(value);
        }
        setFieldInputs(nextInputs);
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError((err as Error).message || "기관 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!mounted) {
          return;
        }
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [api, institutionId, mode]);

  useEffect(() => {
    let mounted = true;
    void api
      .listInstitutionTypeFields(typeCode)
      .then((fields) => {
        if (!mounted) {
          return;
        }
        setTypeFields(fields);
        setFieldInputs((prev) => {
          const next: Record<string, string | boolean> = {};
          for (const field of fields) {
            if (Object.prototype.hasOwnProperty.call(prev, field.fieldKey)) {
              next[field.fieldKey] = prev[field.fieldKey];
              continue;
            }
            next[field.fieldKey] = field.dataType === "BOOLEAN" ? false : "";
          }
          return next;
        });
      })
      .catch((err) => {
        if (!mounted) {
          return;
        }
        setError((err as Error).message || "타입 필드를 불러오지 못했습니다.");
      });

    return () => {
      mounted = false;
    };
  }, [api, typeCode]);

  const isEdit = mode === "edit";
  const title = isEdit ? "기관 수정" : "기관 등록";

  const fieldGroups = useMemo(() => [...typeFields].sort((a, b) => a.sortOrder - b.sortOrder), [typeFields]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const latNum = lat.trim() ? Number(lat) : undefined;
    const lngNum = lng.trim() ? Number(lng) : undefined;
    if (lat.trim() && !Number.isFinite(latNum)) {
      setError("위도(lat)는 숫자여야 합니다.");
      return;
    }
    if (lng.trim() && !Number.isFinite(lngNum)) {
      setError("경도(lng)는 숫자여야 합니다.");
      return;
    }
    if (!isEdit && typeCode === "SCHOOL" && !schoolAdminLoginId.trim()) {
      setError("학교 관리자 아이디를 입력해 주세요.");
      return;
    }
    if (!isEdit && typeCode === "SCHOOL" && !schoolAdminPassword) {
      setError("학교 관리자 임시 비밀번호를 입력해 주세요.");
      return;
    }

    const fields: Record<string, InstitutionFieldValue> = {};
    for (const field of fieldGroups) {
      const raw = fieldInputs[field.fieldKey];
      fields[field.fieldKey] = parseFieldInput(field.dataType, raw ?? "");
    }

    const payload: UpsertInstitutionInput = {
      name: name.trim(),
      typeCode,
      status,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      addressRoad: addressRoad.trim() || undefined,
      addressDetail: addressDetail.trim() || undefined,
      lat: latNum,
      lng: lngNum,
      memo: memo.trim() || undefined,
      contractStartDate: contractStartDate.trim() || undefined,
      contractEndDate: contractEndDate.trim() || undefined,
      fields,
      schoolAdmin:
        !isEdit && typeCode === "SCHOOL"
          ? {
              loginId: schoolAdminLoginId.trim(),
              password: schoolAdminPassword
            }
          : undefined
    };

    try {
      setSaving(true);
      const saved = isEdit
        ? await api.updateInstitution(institutionId, payload)
        : await api.createInstitution(payload);
      navigate(`/institutions/${encodeURIComponent(saved.id)}`);
    } catch (err) {
      const message = (err as Error).message || "기관 저장에 실패했습니다.";
      if (message.includes("INSTITUTION_NAME_CONFLICT")) {
        setError("기관명이 이미 존재합니다.");
      } else if (message.includes("SCHOOL_ADMIN_LOGIN_ID_CONFLICT")) {
        setError("학교 관리자 아이디가 이미 존재합니다.");
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="empty-text">기관 정보를 불러오는 중입니다.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h3>{title}</h3>
        <div className="action-row">
          <Link to="/institutions">목록으로</Link>
          {isEdit ? <Link to={`/institutions/${encodeURIComponent(institutionId)}`}>상세</Link> : null}
        </div>
      </div>

      <form className="grid-form" onSubmit={onSubmit}>
        <label>
          기관명
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          기관 타입
          <select value={typeCode} onChange={(event) => setTypeCode(event.target.value as InstitutionTypeCode)}>
            <option value="SCHOOL">학교</option>
            <option value="PARK">공원</option>
          </select>
        </label>
        <label>
          상태
          <select value={status} onChange={(event) => setStatus(event.target.value as InstitutionStatus)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="PENDING">PENDING</option>
          </select>
        </label>
        <label>
          담당자
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </label>
        <label>
          연락처
          <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        </label>
        <label className="wide">
          도로명 주소
          <input value={addressRoad} onChange={(event) => setAddressRoad(event.target.value)} />
        </label>
        <label className="wide">
          상세 주소
          <input value={addressDetail} onChange={(event) => setAddressDetail(event.target.value)} />
        </label>
        <label>
          위도(lat)
          <input value={lat} onChange={(event) => setLat(event.target.value)} placeholder="37.4979" />
        </label>
        <label>
          경도(lng)
          <input value={lng} onChange={(event) => setLng(event.target.value)} placeholder="127.0276" />
        </label>
        <label>
          계약 시작일(YYYY-MM-DD)
          <input type="date" value={contractStartDate} onChange={(event) => setContractStartDate(event.target.value)} />
        </label>
        <label>
          계약 종료일(YYYY-MM-DD, 미포함)
          <input type="date" value={contractEndDate} onChange={(event) => setContractEndDate(event.target.value)} />
        </label>
        <label className="wide">
          메모
          <textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={3} />
        </label>
        {!isEdit && typeCode === "SCHOOL" ? (
          <div className="wide info-card">
            <p>
              <strong>학교 관리자 계정</strong>
            </p>
            <p className="muted">
              임시 비밀번호는 짧아도 됩니다. 첫 로그인 시 비밀번호 재설정이 강제됩니다.
            </p>
            <div className="grid-form">
              <label>
                학교 관리자 아이디
                <input
                  value={schoolAdminLoginId}
                  onChange={(event) => setSchoolAdminLoginId(event.target.value)}
                  required
                />
              </label>
              <label>
                학교 관리자 임시 비밀번호
                <input
                  type="text"
                  value={schoolAdminPassword}
                  onChange={(event) => setSchoolAdminPassword(event.target.value)}
                  required
                />
              </label>
            </div>
          </div>
        ) : null}

        <div className="wide info-card">
          <p>
            <strong>타입별 정보</strong>
          </p>
          <div className="grid-form">
            {fieldGroups.map((field) => (
              <label key={field.id} className={field.dataType === "TEXT" ? "wide" : ""}>
                {field.label}
                {field.isRequired ? " *" : ""}
                {field.dataType === "BOOLEAN" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(fieldInputs[field.fieldKey])}
                    onChange={(event) =>
                      setFieldInputs((prev) => ({ ...prev, [field.fieldKey]: event.target.checked }))
                    }
                  />
                ) : field.dataType === "SELECT" ? (
                  <select
                    value={String(fieldInputs[field.fieldKey] ?? "")}
                    onChange={(event) =>
                      setFieldInputs((prev) => ({ ...prev, [field.fieldKey]: event.target.value }))
                    }
                  >
                    <option value="">선택</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.dataType === "NUMBER" ? "number" : "text"}
                    value={String(fieldInputs[field.fieldKey] ?? "")}
                    onChange={(event) =>
                      setFieldInputs((prev) => ({ ...prev, [field.fieldKey]: event.target.value }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="wide action-row">
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "저장 중..." : isEdit ? "수정 저장" : "기관 등록"}
          </button>
        </div>
      </form>

      {error ? <p className="status danger-text">{error}</p> : null}
    </section>
  );
}
