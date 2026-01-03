type Receipt = {
  id: string;
  date: string;
  amount: string;
  description: string;
};

type PaymentsBillingProps = {
  sessionsPaid: number;
  sessionsUsed: number;
  remainingBalance: string;
  receipts: Receipt[];
};

export default function PaymentsBilling({
  sessionsPaid,
  sessionsUsed,
  remainingBalance,
  receipts,
}: PaymentsBillingProps) {
  const sessionsRemaining = sessionsPaid - sessionsUsed;
  const usagePercentage = sessionsPaid > 0 ? Math.round((sessionsUsed / sessionsPaid) * 100) : 0;

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Payments & Billing</h2>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Sessions Paid */}
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-xl p-5">
          <p className="text-sm text-gray-400 mb-1">Sessions Paid For</p>
          <p className="text-3xl font-bold text-blue-400">{sessionsPaid}</p>
        </div>

        {/* Sessions Used */}
        <div className="bg-purple-900/30 border border-purple-700/50 rounded-xl p-5">
          <p className="text-sm text-gray-400 mb-1">Sessions Used</p>
          <p className="text-3xl font-bold text-purple-400">{sessionsUsed}</p>
        </div>

        {/* Sessions Remaining */}
        <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-5">
          <p className="text-sm text-gray-400 mb-1">Sessions Remaining</p>
          <p className="text-3xl font-bold text-green-400">{sessionsRemaining}</p>
        </div>
      </div>

      {/* Usage Bar */}
      <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 font-medium">Usage</span>
          <span className="text-xl font-bold text-itutor-white">{usagePercentage}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${usagePercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Remaining Balance */}
      <div className="bg-gradient-to-r from-itutor-green to-emerald-600 rounded-xl p-5 mb-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/80 mb-1">Current Balance</p>
            <p className="text-3xl font-bold text-white">{remainingBalance}</p>
          </div>
          <div className="bg-white/20 rounded-full p-3">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Receipts */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
        <h3 className="text-lg font-bold text-itutor-white mb-4">Recent Receipts</h3>
        {receipts.length > 0 ? (
          <div className="space-y-3">
            {receipts.map((receipt) => (
              <div
                key={receipt.id}
                className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-gray-300 font-medium">{receipt.description}</p>
                  <p className="text-sm text-gray-500">{receipt.date}</p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-lg font-bold text-itutor-green">{receipt.amount}</p>
                  <button className="text-itutor-green hover:text-emerald-400 transition-colors">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-4">No receipts available</p>
        )}
      </div>
    </div>
  );
}








