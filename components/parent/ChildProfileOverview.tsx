type ChildProfileOverviewProps = {
  childName: string;
  school: string;
  formLevel: string;
  subjects: string[];
  tutors: string[];
};

export default function ChildProfileOverview({
  childName,
  school,
  formLevel,
  subjects,
  tutors,
}: ChildProfileOverviewProps) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Child Profile</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Full Name */}
        <div>
          <p className="text-sm text-gray-400 mb-1 font-medium">Full Name</p>
          <p className="text-lg text-itutor-white font-semibold">{childName}</p>
        </div>

        {/* School */}
        <div>
          <p className="text-sm text-gray-400 mb-1 font-medium">School</p>
          <p className="text-lg text-itutor-white font-semibold">{school}</p>
        </div>

        {/* Form Level */}
        <div>
          <p className="text-sm text-gray-400 mb-1 font-medium">Form / Year</p>
          <p className="text-lg text-itutor-white font-semibold">{formLevel}</p>
        </div>

        {/* Subjects */}
        <div className="md:col-span-2">
          <p className="text-sm text-gray-400 mb-2 font-medium">Subjects Enrolled</p>
          <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <span
                key={subject}
                className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium shadow-lg"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>

        {/* Tutors */}
        <div>
          <p className="text-sm text-gray-400 mb-2 font-medium">Assigned iTutors</p>
          <div className="flex flex-wrap gap-2">
            {tutors.map((tutor) => (
              <span
                key={tutor}
                className="px-3 py-1.5 bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-lg text-sm font-medium shadow-lg"
              >
                {tutor}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}




