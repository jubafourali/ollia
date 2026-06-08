export type GlobeMember = {
  id: string;
  name: string;
  relation: string;
  region: string;
  status: "active" | "recent" | "away" | "inactive";
  lastCheckInAt: Date | null;
  lastSeen: Date;
  isMe?: boolean;
  pending?: boolean;
};

export type ResolvedPin = {
  id: string;
  name: string;
  relation: string;
  region: string;
  status: GlobeMember["status"];
  lastCheckInAt: Date | null;
  lastSeen: Date;
  isMe?: boolean;
  lat: number;
  lng: number;
  pinColor: string;
};
