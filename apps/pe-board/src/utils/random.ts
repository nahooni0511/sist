import { TEAM_COLORS } from "../data/defaults";
import { StudentInput, TeamCard, TeamHistoryEntry } from "../types/app";

export interface TeamGenerationOptions {
  students: StudentInput[];
  teamCount: number;
  history: TeamHistoryEntry[];
  balanceGender: boolean;
  balanceLevel: boolean;
  avoidRepeatPairs: boolean;
  pinnedTeamByStudentId?: Record<string, number>;
}

const pairKey = (a: string, b: string): string => {
  return [a, b].sort().join("::");
};

const makePairPenaltyMap = (history: TeamHistoryEntry[]): Map<string, number> => {
  const map = new Map<string, number>();
  history.forEach((entry) => {
    entry.teams.forEach((group) => {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const key = pairKey(group[i], group[j]);
          map.set(key, (map.get(key) ?? 0) + 1);
        }
      }
    });
  });
  return map;
};

export const shuffle = <T,>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const parseRosterInput = (rosterText: string, studentCount: number): StudentInput[] => {
  const lines = rosterText
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return Array.from({ length: studentCount }, (_, idx) => ({
      id: `s-${idx + 1}`,
      name: `학생 ${idx + 1}`,
    }));
  }

  return lines.map((line, idx) => {
    const [rawName = "", rawGender = "", rawLevel = ""] = line.split(",").map((v) => v.trim());
    const upperGender = rawGender.toUpperCase();
    const gender =
      upperGender === "M" || rawGender === "남" ? "M" : upperGender === "F" || rawGender === "여" ? "F" : undefined;
    const level = Number.isFinite(Number(rawLevel)) ? Number(rawLevel) : undefined;
    return {
      id: `named-${idx + 1}`,
      name: rawName || `학생 ${idx + 1}`,
      gender,
      level,
    };
  });
};

const calcGenderPenalty = (team: StudentInput[], candidate: StudentInput): number => {
  if (!candidate.gender) {
    return 0;
  }
  const male = team.filter((m) => m.gender === "M").length;
  const female = team.filter((m) => m.gender === "F").length;
  const projectedMale = male + (candidate.gender === "M" ? 1 : 0);
  const projectedFemale = female + (candidate.gender === "F" ? 1 : 0);
  return Math.abs(projectedMale - projectedFemale) * 8;
};

const calcLevelPenalty = (team: StudentInput[], candidate: StudentInput): number => {
  if (candidate.level === undefined) {
    return 0;
  }
  const total = team.reduce((acc, item) => acc + (item.level ?? 2), 0);
  return (total + candidate.level) * 2;
};

export const generateBalancedTeams = (options: TeamGenerationOptions): TeamCard[] => {
  const {
    students,
    teamCount,
    history,
    balanceGender,
    balanceLevel,
    avoidRepeatPairs,
    pinnedTeamByStudentId = {},
  } = options;

  const cappedTeamCount = Math.max(2, Math.min(6, teamCount));
  const pairPenaltyMap = makePairPenaltyMap(history);

  const teams: TeamCard[] = Array.from({ length: cappedTeamCount }, (_, idx) => ({
    id: `team-${idx + 1}`,
    name: `팀 ${idx + 1}`,
    color: TEAM_COLORS[idx],
    members: [],
  }));

  const pinned = students.filter((s) => pinnedTeamByStudentId[s.id] !== undefined);
  const remaining = students.filter((s) => pinnedTeamByStudentId[s.id] === undefined);

  pinned.forEach((student) => {
    const teamIndex = pinnedTeamByStudentId[student.id];
    if (teamIndex !== undefined && teams[teamIndex]) {
      teams[teamIndex].members.push(student);
    }
  });

  const sorted = shuffle(remaining).sort((a, b) => {
    if (!balanceLevel) {
      return 0;
    }
    return (b.level ?? 2) - (a.level ?? 2);
  });

  sorted.forEach((student) => {
    let bestScore = Number.POSITIVE_INFINITY;
    let candidates: number[] = [];

    teams.forEach((team, idx) => {
      let score = team.members.length * 100;

      if (balanceGender) {
        score += calcGenderPenalty(team.members, student);
      }
      if (balanceLevel) {
        score += calcLevelPenalty(team.members, student);
      }
      if (avoidRepeatPairs) {
        const pairPenalty = team.members.reduce((acc, member) => {
          return acc + (pairPenaltyMap.get(pairKey(member.name, student.name)) ?? 0) * 30;
        }, 0);
        score += pairPenalty;
      }

      if (score < bestScore) {
        bestScore = score;
        candidates = [idx];
      } else if (score === bestScore) {
        candidates.push(idx);
      }
    });

    const chosenTeamIndex = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
    teams[chosenTeamIndex].members.push(student);
  });

  return teams.map((team) => ({
    ...team,
    members: team.members.sort((a, b) => a.name.localeCompare(b.name, "ko")),
  }));
};

export const pickRandomNumber = (max: number): number => {
  return Math.floor(Math.random() * Math.max(1, max)) + 1;
};
