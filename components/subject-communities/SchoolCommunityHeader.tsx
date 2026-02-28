'use client';

interface SchoolCommunityHeaderProps {
  schoolName: string;
  memberCount: number;
  description?: string;
}

export default function SchoolCommunityHeader({
  schoolName,
  memberCount,
  description,
}: SchoolCommunityHeaderProps) {
  return (
    <section
      className="w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      aria-label="School community"
    >
      <h2 className="text-lg font-semibold text-gray-900">{schoolName}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {memberCount.toLocaleString()} students
      </p>
      {description && (
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      )}
    </section>
  );
}
