type Props = {
  className?: string;
};

export default function PaidClassesLockNotice({ className }: Props) {
  return (
    <div
      className={
        className ||
        'bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900'
      }
    >
      <p className="font-semibold">
        Paid classes will be available shortly.
      </p>
      <p className="mt-1">
        During our initial launch period, tutors can host free classes only.
      </p>
    </div>
  );
}

