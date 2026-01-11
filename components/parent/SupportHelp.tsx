export default function SupportHelp() {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Support & Help</h2>
      
      {/* Contact Support */}
      <div className="bg-gradient-to-r from-itutor-green to-emerald-600 rounded-xl p-6 mb-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 rounded-full p-3 flex-shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-2">Need Help?</h3>
            <p className="text-white/90 mb-4">
              Our support team is here to assist you with any questions or concerns about your child's tutoring experience.
            </p>
            <a
              href="mailto:support@itutor.com"
              className="inline-block bg-white text-itutor-green px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* FAQ */}
        <a
          href="#"
          className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:bg-gray-800 hover:border-itutor-green/50 transition-all duration-200 group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500/20 rounded-lg p-2 group-hover:bg-blue-500/30 transition-colors">
              <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-itutor-white">FAQs</h3>
          </div>
          <p className="text-sm text-gray-400">Find answers to common questions</p>
        </a>

        {/* Help Centre */}
        <a
          href="#"
          className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:bg-gray-800 hover:border-itutor-green/50 transition-all duration-200 group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-purple-500/20 rounded-lg p-2 group-hover:bg-purple-500/30 transition-colors">
              <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-itutor-white">Help Centre</h3>
          </div>
          <p className="text-sm text-gray-400">Browse guides and resources</p>
        </a>
      </div>

      {/* Reassurance Message */}
      <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <div className="bg-green-500/20 rounded-full p-2 flex-shrink-0">
            <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-itutor-green mb-2">Your Child's Progress Matters to Us</h4>
            <p className="text-sm text-gray-400 leading-relaxed">
              We're committed to providing a safe, supportive, and effective learning environment. 
              All tutors are verified, and sessions are monitored to ensure quality. 
              If you ever have concerns, we're here to help.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}














