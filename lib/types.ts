export type ActionResult = { ok: boolean; message: string };
export type Role = 'admin' | 'vendor';
export type IndexStatus = 'pending' | 'indexed' | 'not_indexed';

export type Profile = {
  id: string;
  email: string;
  role: Role;
  vendor_id: string | null;
  vendor_name: string | null;
};
