'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';

interface User {
  id: string;
  email: string;
  full_name: string;
  display_name: string;
  role: string;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  user_type: string;
  stage: number;
}

export default function AdminEmailsPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'templates' | 'mailing-list'>('send');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'student' | 'tutor' | 'parent'>('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  
  // Email form
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [previewEmail, setPreviewEmail] = useState(false);
  
  // Template editor
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateUserType, setTemplateUserType] = useState('student');
  const [templateStage, setTemplateStage] = useState(0);
  
  // Preview
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [previewName, setPreviewName] = useState('Alex');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userTypeFilter !== 'all') params.append('role', userTypeFilter);
      if (dateFromFilter) params.append('dateFrom', dateFromFilter);
      if (dateToFilter) params.append('dateTo', dateToFilter);

      const response = await fetch(`/api/admin/accounts?${params.toString()}`);
      const data = await response.json();
      setUsers(data.accounts || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
    }
    setLoading(false);
  }, [userTypeFilter, dateFromFilter, dateToFilter]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/email-templates');
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      if (!response.ok) {
        console.error('API Error:', data.error);
        alert(`Error loading templates: ${data.error || 'Unknown error'}`);
      }
      setTemplates(data.templates || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      alert(`Failed to fetch templates: ${error.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'mailing-list') {
      fetchUsers();
    } else if (activeTab === 'templates') {
      fetchTemplates();
    }
  }, [activeTab, fetchUsers, fetchTemplates]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsers = () => {
    setSelectedUsers(users.map(u => u.id));
  };

  const deselectAllUsers = () => {
    setSelectedUsers([]);
  };

  const sendEmail = async () => {
    if (!emailSubject || !emailContent || selectedUsers.length === 0) {
      alert('Please fill in subject, content, and select at least one recipient');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers,
          subject: emailSubject,
          htmlContent: emailContent
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert(`Email sent successfully to ${data.sent} users!`);
        setEmailSubject('');
        setEmailContent('');
        setSelectedUsers([]);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      alert('Failed to send email');
    }
    setLoading(false);
  };

  const saveTemplate = async () => {
    if (!templateName || !templateSubject || !templateContent) {
      alert('Please fill in all template fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/email-templates', {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplate?.id,
          name: templateName,
          subject: templateSubject,
          html_content: templateContent,
          user_type: templateUserType,
          stage: templateStage
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert('Template saved successfully!');
        setEditingTemplate(null);
        setTemplateName('');
        setTemplateSubject('');
        setTemplateContent('');
        fetchTemplates();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
    setLoading(false);
  };

  const loadTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateSubject(template.subject);
    setTemplateContent(template.html_content);
    setTemplateUserType(template.user_type);
    setTemplateStage(template.stage);
  };

  const useTemplateForEmail = (template: EmailTemplate) => {
    // Replace {{firstName}} with actual placeholder text for editing
    const subjectWithPlaceholder = template.subject;
    const contentWithPlaceholder = template.html_content;
    
    setEmailSubject(subjectWithPlaceholder);
    setEmailContent(contentWithPlaceholder);
    setActiveTab('send');
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/email-templates/${templateId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('Template deleted successfully!');
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
    setLoading(false);
  };

  const getPreviewHtml = (html: string, subject: string) => {
    // Replace {{firstName}} placeholder with preview name
    const personalizedHtml = html.replace(/\{\{firstName\}\}/g, previewName);
    const personalizedSubject = subject.replace(/\{\{firstName\}\}/g, previewName);
    
    return { html: personalizedHtml, subject: personalizedSubject };
  };

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Email Management</h1>
          <p className="text-gray-600 mt-2">Send emails, manage templates, and view mailing lists</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('send')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'send'
                  ? 'border-itutor-green text-itutor-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Send Email
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'templates'
                  ? 'border-itutor-green text-itutor-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Email Templates
            </button>
            <button
              onClick={() => setActiveTab('mailing-list')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'mailing-list'
                  ? 'border-itutor-green text-itutor-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Mailing List
            </button>
          </nav>
        </div>

        {/* Send Email Tab */}
        {activeTab === 'send' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Compose Email</h2>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-700">
                  <strong>📧 How it works:</strong> Select recipients from the Mailing List tab, then compose your message here. 
                  Use <code className="bg-green-100 px-2 py-0.5 rounded">{'{{firstName}}'}</code> for personalization.
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients ({selectedUsers.length} selected)
                </label>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab('mailing-list')}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    📋 Select Recipients
                  </button>
                  {selectedUsers.length > 0 && (
                    <button
                      onClick={deselectAllUsers}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-transparent"
                  placeholder="Enter subject (use {{firstName}} for personalization)"
                />
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Email Content (HTML)
                  </label>
                  <button
                    onClick={() => setActiveTab('templates')}
                    className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    📋 Load Template
                  </button>
                </div>
                <textarea
                  value={emailContent}
                  onChange={(e) => setEmailContent(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-transparent font-mono text-sm"
                  placeholder="Enter HTML content or load a template..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use HTML for formatting. {'{{firstName}}'} will be replaced with each recipient's name.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={sendEmail}
                  disabled={loading || selectedUsers.length === 0}
                  className="px-6 py-3 bg-itutor-green text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : `Send to ${selectedUsers.length} Users`}
                </button>
                <button
                  onClick={() => setPreviewEmail(!previewEmail)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
                >
                  {previewEmail ? 'Hide Preview' : 'Preview'}
                </button>
              </div>

              {previewEmail && emailContent && (
                <div className="mt-6 border-t pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Email Preview</h3>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Preview as:</label>
                      <input
                        type="text"
                        value={previewName}
                        onChange={(e) => setPreviewName(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm w-32"
                        placeholder="Name..."
                      />
                    </div>
                  </div>
                  <div className="border rounded-lg p-6 bg-white shadow-sm">
                    <div className="mb-4 pb-4 border-b bg-gray-50 -m-6 p-6 rounded-t-lg">
                      <p className="text-sm text-gray-600">
                        <strong>From:</strong> iTutor &lt;hello@myitutor.com&gt;
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Subject:</strong> {getPreviewHtml(emailContent, emailSubject || '(No subject)').subject}
                      </p>
                    </div>
                    <div 
                      className="mt-6"
                      dangerouslySetInnerHTML={{ 
                        __html: getPreviewHtml(emailContent, emailSubject || '').html 
                      }} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Email Templates</h2>
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateName('');
                    setTemplateSubject('');
                    setTemplateContent('');
                  }}
                  className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-green-700"
                >
                  New Template
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Template List */}
                <div>
                  <h3 className="font-semibold mb-4">Saved Templates ({templates.length})</h3>
                  {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading templates...</div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">
                      <p>No templates yet</p>
                      <p className="text-sm mt-2">Create your first template to get started!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          className="border rounded-lg p-4 hover:border-itutor-green transition-all"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-semibold text-gray-900">{template.name}</h4>
                            <div className="flex gap-2">
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">
                                {template.user_type}
                              </span>
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded font-medium">
                                Day {template.stage}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.subject}</p>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => setPreviewTemplate(template)}
                              className="text-sm px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                            >
                              👁️ Preview
                            </button>
                            <button
                              onClick={() => loadTemplate(template)}
                              className="text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => useTemplateForEmail(template)}
                              className="text-sm px-3 py-1.5 bg-itutor-green text-white rounded hover:bg-green-700 font-medium"
                            >
                              📧 Use
                            </button>
                            <button
                              onClick={() => deleteTemplate(template.id)}
                              className="text-sm px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Template Editor */}
                <div className="border-l-4 border-itutor-green pl-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-lg">
                      {editingTemplate ? '✏️ Edit Template' : '➕ Create New Template'}
                    </h3>
                    {editingTemplate && (
                      <button
                        onClick={() => {
                          setEditingTemplate(null);
                          setTemplateName('');
                          setTemplateSubject('');
                          setTemplateContent('');
                        }}
                        className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template Name
                      </label>
                      <input
                        type="text"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        placeholder="e.g., Welcome Email"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        User Type
                      </label>
                      <select
                        value={templateUserType}
                        onChange={(e) => setTemplateUserType(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="student">Student</option>
                        <option value="tutor">Tutor</option>
                        <option value="parent">Parent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Stage (Day)
                      </label>
                      <input
                        type="number"
                        value={templateStage}
                        onChange={(e) => setTemplateStage(parseInt(e.target.value))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        min="0"
                        max="7"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={templateSubject}
                        onChange={(e) => setTemplateSubject(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        placeholder="Email subject..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        HTML Content
                      </label>
                      <textarea
                        value={templateContent}
                        onChange={(e) => setTemplateContent(e.target.value)}
                        rows={8}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                        placeholder="HTML content..."
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-blue-700">
                        <strong>💡 Tip:</strong> Use <code className="bg-blue-100 px-2 py-0.5 rounded">{'{{firstName}}'}</code> in your subject or content to personalize emails with the recipient's first name.
                      </p>
                    </div>

                    <button
                      onClick={saveTemplate}
                      disabled={loading}
                      className="w-full px-6 py-3 bg-itutor-green text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Save Template')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mailing List Tab */}
        {activeTab === 'mailing-list' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Mailing List</h2>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Type
                  </label>
                  <select
                    value={userTypeFilter}
                    onChange={(e) => setUserTypeFilter(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="all">All Users</option>
                    <option value="student">Students</option>
                    <option value="tutor">Tutors</option>
                    <option value="parent">Parents</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Joined From
                  </label>
                  <input
                    type="date"
                    value={dateFromFilter}
                    onChange={(e) => setDateFromFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Joined To
                  </label>
                  <input
                    type="date"
                    value={dateToFilter}
                    onChange={(e) => setDateToFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={fetchUsers}
                    className="w-full px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-green-700"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* Selection Actions */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={selectAllUsers}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                >
                  Select All ({users.length})
                </button>
                <button
                  onClick={deselectAllUsers}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Deselect All
                </button>
                {selectedUsers.length > 0 && (
                  <button
                    onClick={() => setActiveTab('send')}
                    className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-green-700"
                  >
                    Compose Email to {selectedUsers.length} Users
                  </button>
                )}
              </div>

              {/* User List */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Select
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                          Loading...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              className="h-4 w-4 text-itutor-green focus:ring-itutor-green border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {user.display_name || user.full_name || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewTemplate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Email Preview</h2>
                  <p className="text-sm text-gray-600 mt-1">{previewTemplate.name}</p>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Preview Controls */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700">
                    Preview as:
                  </label>
                  <input
                    type="text"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm w-48"
                    placeholder="Enter name..."
                  />
                  <div className="text-xs text-gray-500">
                    (This replaces {'{{firstName}}'} in the email)
                  </div>
                </div>
              </div>

              {/* Email Preview */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4 pb-4 border-b">
                  <p className="text-sm text-gray-600">
                    <strong>From:</strong> iTutor &lt;hello@myitutor.com&gt;
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    <strong>Subject:</strong> {getPreviewHtml(previewTemplate.html_content, previewTemplate.subject).subject}
                  </p>
                </div>
                
                <div 
                  className="border rounded-lg"
                  dangerouslySetInnerHTML={{ 
                    __html: getPreviewHtml(previewTemplate.html_content, previewTemplate.subject).html 
                  }}
                />
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t bg-gray-50 flex justify-between">
                <button
                  onClick={() => {
                    useTemplateForEmail(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  className="px-4 py-2 bg-itutor-green text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  📧 Use This Template
                </button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
