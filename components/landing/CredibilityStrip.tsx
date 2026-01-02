export default function CredibilityStrip() {
  const credentials = [
    'Used by students across Trinidad & Tobago',
    'Trusted by parents and educators',
  ];

  return (
    <section className="bg-itutor-black/95 py-12 sm:py-16 border-t border-itutor-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
          {credentials.map((credential, index) => (
            <div key={index} className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-itutor-green flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-itutor-muted text-sm sm:text-base font-medium">
                {credential}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

