'use client';

import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

interface RegisterPatientModalProps {
  onSubmit: (data: Record<string, string>, imageFile: File | null) => Promise<void>;
  onClose: () => void;
  error?: string | null;
}

export function RegisterPatientModal({ onSubmit, onClose, error }: RegisterPatientModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    location: '',
    cancer_type: '',
    stage: '',
    treatment: '',
    goal_amount: '',
    raised_amount: '',
    summary: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageError(null);

    if (!file) {
      setImageFile(null);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileName = file.name.toLowerCase();
    if (!allowedTypes.includes(file.type) || !allowedExtensions.some((extension) => fileName.endsWith(extension))) {
      setImageFile(null);
      e.target.value = '';
      setImageError('Please choose a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageFile(null);
      e.target.value = '';
      setImageError('The patient photo must be 5MB or smaller.');
      return;
    }

    setImageFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (imageError) return;
    setSubmitting(true);
    try {
      await onSubmit(formData, imageFile);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-2xl font-bold text-slate-900">Register New Patient</h2>
          <p className="mt-1 text-slate-600">Add a patient campaign to the BPL donation platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6 max-h-[80vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-900">Full Name *</label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Age *</label>
              <input
                type="number"
                name="age"
                required
                value={formData.age}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Gender *</label>
              <select
                name="gender"
                required
                value={formData.gender}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Location *</label>
              <input
                type="text"
                name="location"
                required
                value={formData.location}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Cancer Type *</label>
              <input
                type="text"
                name="cancer_type"
                required
                value={formData.cancer_type}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Stage *</label>
              <input
                type="text"
                name="stage"
                required
                value={formData.stage}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-900">Treatment *</label>
              <input
                type="text"
                name="treatment"
                required
                value={formData.treatment}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Funding Goal (₹) *</label>
              <input
                type="number"
                name="goal_amount"
                required
                value={formData.goal_amount}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900">Already Raised (₹)</label>
              <input
                type="number"
                name="raised_amount"
                value={formData.raised_amount}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-900">Patient Story</label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-900">Patient Photo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              <p className="mt-1 text-xs text-slate-500">JPG, PNG, or WebP up to 5MB.</p>
              {imageError && <p className="mt-1 text-sm text-red-600">{imageError}</p>}
              {imagePreview && (
                <img src={imagePreview} alt="Selected patient photo preview" className="mt-3 h-24 w-24 rounded-lg object-cover" />
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-900 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700"
            >
              {submitting ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
