import { requireProfile } from '@/lib/auth';
import BulkSearch from '@/components/BulkSearch';

export default async function BulkPage() {
  await requireProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Bulk search</h1>
      <p className="text-sm text-muted">Websites are cleaned automatically: http/https, www and trailing slashes are ignored.</p>
      <BulkSearch />
    </div>
  );
}
