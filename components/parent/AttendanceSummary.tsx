type AttendanceSummaryProps = {
  totalBooked: number;
  attended: number;
  missed: number;
  tutorCancellations: number;
};

export default function AttendanceSummary({
  totalBooked,
  attended,
  missed,
  tutorCancellations,
}: AttendanceSummaryProps) {
  const attendanceRate = totalBooked > 0 ? Math.round((attended / totalBooked) * 100) : 0;

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Attendance Summary</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Total Booked */}
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400 mb-1">{totalBooked}</p>
          <p className="text-sm text-gray-400">Total Booked</p>
        </div>

        {/* Attended */}
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400 mb-1">{attended}</p>
          <p className="text-sm text-gray-400">Attended</p>
        </div>

        {/* Missed */}
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400 mb-1">{missed}</p>
          <p className="text-sm text-gray-400">Student Missed</p>
        </div>

        {/* Tutor Cancellations */}
        <div className="bg-orange-900/30 border border-orange-700/50 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400 mb-1">{tutorCancellations}</p>
          <p className="text-sm text-gray-400">Tutor Cancelled</p>
        </div>
      </div>

      {/* Attendance Rate */}
      <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 font-medium">Attendance Rate</span>
          <span className="text-2xl font-bold text-itutor-green">{attendanceRate}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-itutor-green to-emerald-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${attendanceRate}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
}









