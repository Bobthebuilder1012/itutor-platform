type FocusArea = {
  strugglingWith: string[];
  workingOn: string[];
  confidentIn: string[];
};

type AcademicFocusAreasProps = {
  focusArea: FocusArea;
};

export default function AcademicFocusAreas({ focusArea }: AcademicFocusAreasProps) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Academic Focus Areas</h2>
      
      <div className="space-y-6">
        {/* Struggling With */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-red-500/20 rounded-lg p-2">
              <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-red-400">Struggling With</h3>
          </div>
          {focusArea.strugglingWith.length > 0 ? (
            <ul className="space-y-2 ml-12">
              {focusArea.strugglingWith.map((item, index) => (
                <li key={index} className="text-gray-300 flex items-start gap-2">
                  <span className="text-red-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 ml-12 italic">No areas of concern</p>
          )}
        </div>

        {/* Currently Working On */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-blue-500/20 rounded-lg p-2">
              <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-blue-400">Currently Working On</h3>
          </div>
          {focusArea.workingOn.length > 0 ? (
            <ul className="space-y-2 ml-12">
              {focusArea.workingOn.map((item, index) => (
                <li key={index} className="text-gray-300 flex items-start gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 ml-12 italic">No current focus</p>
          )}
        </div>

        {/* Confident In */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-green-500/20 rounded-lg p-2">
              <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-400">Confident In</h3>
          </div>
          {focusArea.confidentIn.length > 0 ? (
            <ul className="space-y-2 ml-12">
              {focusArea.confidentIn.map((item, index) => (
                <li key={index} className="text-gray-300 flex items-start gap-2">
                  <span className="text-green-400 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 ml-12 italic">Building confidence</p>
          )}
        </div>
      </div>

      <div className="mt-6 bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <p className="text-sm text-gray-400">
          <span className="font-semibold text-itutor-green">Note:</span> These focus areas are regularly updated by your child's tutors based on session observations.
        </p>
      </div>
    </div>
  );
}














