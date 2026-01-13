type Feedback = {
  id: string;
  date: string;
  subject: string;
  topicCovered: string;
  effortLevel: 'Low' | 'Medium' | 'High';
  understandingLevel: 'Needs Work' | 'Improving' | 'Strong';
  comment: string;
};

type TutorFeedbackProps = {
  feedback: Feedback[];
};

export default function TutorFeedback({ feedback }: TutorFeedbackProps) {
  const getEffortColor = (level: string) => {
    switch (level) {
      case 'High':
        return 'from-green-500 to-emerald-600';
      case 'Medium':
        return 'from-yellow-500 to-amber-600';
      case 'Low':
        return 'from-red-500 to-red-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getUnderstandingColor = (level: string) => {
    switch (level) {
      case 'Strong':
        return 'from-green-500 to-emerald-600';
      case 'Improving':
        return 'from-blue-500 to-blue-600';
      case 'Needs Work':
        return 'from-orange-500 to-orange-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Recent Tutor Feedback</h2>
      
      {feedback.length > 0 ? (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div
              key={item.id}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:bg-gray-800 hover:border-itutor-green/50 transition-all duration-200"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-itutor-white mb-1">{item.subject}</h3>
                  <p className="text-sm text-gray-400">{item.date}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r ${getEffortColor(item.effortLevel)} text-white shadow-lg`}>
                    Effort: {item.effortLevel}
                  </span>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full bg-gradient-to-r ${getUnderstandingColor(item.understandingLevel)} text-white shadow-lg`}>
                    {item.understandingLevel}
                  </span>
                </div>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-gray-400 mb-1">
                  <span className="font-semibold text-itutor-green">Topic Covered:</span>
                </p>
                <p className="text-gray-300">{item.topicCovered}</p>
              </div>
              
              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                <p className="text-sm text-gray-400 mb-1 font-semibold">Tutor Comment:</p>
                <p className="text-gray-300 text-sm leading-relaxed">{item.comment}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <p className="text-gray-400">No feedback available yet</p>
        </div>
      )}
    </div>
  );
}















