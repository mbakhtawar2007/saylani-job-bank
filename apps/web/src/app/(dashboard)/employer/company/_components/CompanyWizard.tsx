'use client';

import {
  LEGAL_STRUCTURES,
  LEGAL_STRUCTURE_LABELS,
  COMPANY_SIZE_BANDS,
  COMPANY_SIZE_LABELS,
  RESUBMIT_NOTE_MIN_LENGTH,
  isResubmitNoteSufficient,
  type CompanyStatus,
} from '@jobbank/shared';
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Badge, Input, Select, StatusPill, Textarea } from '@/components/atoms';
import { FormField } from '@/components/molecules';
import { apiFetch, friendlyApiError } from '@/lib/api/client';
import type { CompanyView } from '@/domains/company';

function friendlyError(err: unknown): string {
  return friendlyApiError(err);
}

type WizardStep = 'details' | 'contacts' | 'location' | 'documents' | 'submit';

const STEPS: { id: WizardStep; label: string; title: string; description: string }[] = [
  {
    id: 'details',
    label: 'Details',
    title: 'Company details',
    description: 'Start with your registered business information.',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    title: 'Key contacts',
    description: 'Tell us who Job Bank should contact about your company.',
  },
  {
    id: 'location',
    label: 'Location',
    title: 'Head office location',
    description: 'Add your office address so we can connect you to a nearby branch.',
  },
  {
    id: 'documents',
    label: 'Documents',
    title: 'Company documents',
    description: 'Upload the documents needed to verify your business.',
  },
  {
    id: 'submit',
    label: 'Review',
    title: 'Review and submit',
    description: 'Check your information before sending it for verification.',
  },
];

const STATUS_PILL: Record<
  CompanyStatus,
  { label: string; variant: 'success' | 'danger' | 'warning' | 'neutral' | 'info' }
> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SUBMITTED: { label: 'Submitted', variant: 'info' },
  UNDER_VERIFICATION: { label: 'Under review', variant: 'info' },
  INFO_REQUESTED: { label: 'More info needed', variant: 'warning' },
  RESUBMITTED: { label: 'Resubmitted', variant: 'info' },
  VERIFIED: { label: 'Verified', variant: 'success' },
  REJECTED: { label: 'Not approved', variant: 'danger' },
  SUSPENDED: { label: 'Suspended', variant: 'danger' },
};

function stepIndex(step: WizardStep) {
  return STEPS.findIndex((s) => s.id === step);
}

function nextStep(step: WizardStep): WizardStep | null {
  const idx = stepIndex(step);
  return idx < STEPS.length - 1 ? STEPS[idx + 1]!.id : null;
}

function prevStep(step: WizardStep): WizardStep | null {
  const idx = stepIndex(step);
  return idx > 0 ? STEPS[idx - 1]!.id : null;
}

// ─── Details step ──────────────────────────────────────────────────────

interface DetailsForm {
  legalName: string;
  tradeName: string;
  legalStructure: string;
  ntn: string;
  registrationNo: string;
  industryCode: string;
  sizeBand: string;
  website: string;
  description: string;
}

function DetailsStep({
  company,
  onSaved,
  idempotencyKey,
}: {
  company: CompanyView | null;
  onSaved: (c: CompanyView) => void;
  idempotencyKey: string;
}) {
  const d = company?.details;
  const [form, setForm] = useState<DetailsForm>({
    legalName: d?.legalName ?? '',
    tradeName: d?.tradeName ?? '',
    legalStructure: d?.legalStructure ?? '',
    ntn: d?.ntn ?? '',
    registrationNo: d?.registrationNo ?? '',
    industryCode: d?.industryCode ?? '',
    sizeBand: d?.sizeBand ?? '',
    website: d?.website ?? '',
    description: d?.description ?? '',
  });
  const [industries, setIndustries] = useState<{ code: string; label: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ code: string; label: string }[]>('/api/v1/master-data?type=INDUSTRY')
      .then((res) => setIndustries(res.data))
      .catch(() => undefined);
  }, []);

  const set = (key: keyof DetailsForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = {
        legalName: form.legalName,
        tradeName: form.tradeName || undefined,
        legalStructure: form.legalStructure,
        ntn: form.ntn,
        registrationNo: form.registrationNo || undefined,
        industryCode: form.industryCode,
        sizeBand: form.sizeBand,
        website: form.website || undefined,
        description: form.description || undefined,
      };
      let saved: CompanyView;
      if (!company) {
        ({ data: saved } = await apiFetch<CompanyView>('/api/v1/companies/register', {
          method: 'POST',
          body,
          idempotencyKey,
        }));
      } else {
        ({ data: saved } = await apiFetch<CompanyView>('/api/v1/companies/me', {
          method: 'PATCH',
          body,
        }));
      }
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const isReady =
    form.legalName.trim().length >= 2 &&
    form.legalStructure &&
    form.ntn.trim().length >= 7 &&
    form.industryCode &&
    form.sizeBand;

  return (
    <form className="grid gap-5 sm:grid-cols-2" onSubmit={(e) => void save(e)}>
      <FormField label="Registered company name" required>
        <Input
          placeholder="e.g. Saylani Welfare International Trust"
          value={form.legalName}
          onChange={(e) => set('legalName')(e.target.value)}
        />
      </FormField>
      <FormField label="Trading name" hint="Leave empty if trading under the registered name">
        <Input
          placeholder="e.g. Saylani Welfare"
          value={form.tradeName}
          onChange={(e) => set('tradeName')(e.target.value)}
        />
      </FormField>
      <FormField label="Business type" required>
        <Select
          value={form.legalStructure}
          onChange={(e) => set('legalStructure')(e.target.value)}
          options={LEGAL_STRUCTURES.map((s) => ({ value: s, label: LEGAL_STRUCTURE_LABELS[s] }))}
          placeholder="Choose a type"
        />
      </FormField>
      <FormField label="NTN (National Tax Number)" required>
        <Input
          placeholder="e.g. 1234567-8"
          value={form.ntn}
          onChange={(e) => set('ntn')(e.target.value)}
        />
      </FormField>
      <FormField
        label="Registration / SECP number"
        hint="Required for private/public limited companies"
      >
        <Input
          placeholder="e.g. 0012345"
          value={form.registrationNo}
          onChange={(e) => set('registrationNo')(e.target.value)}
        />
      </FormField>
      <FormField label="Industry" required>
        <Select
          value={form.industryCode}
          onChange={(e) => set('industryCode')(e.target.value)}
          options={industries.map((i) => ({ value: i.code, label: i.label }))}
          placeholder="Choose an industry"
        />
      </FormField>
      <FormField label="Company size" required>
        <Select
          value={form.sizeBand}
          onChange={(e) => set('sizeBand')(e.target.value)}
          options={COMPANY_SIZE_BANDS.map((s) => ({ value: s, label: COMPANY_SIZE_LABELS[s] }))}
          placeholder="Choose a size"
        />
      </FormField>
      <FormField label="Website">
        <Input
          type="url"
          placeholder="https://example.com"
          value={form.website}
          onChange={(e) => set('website')(e.target.value)}
        />
      </FormField>
      <FormField label="About the company" className="sm:col-span-2">
        <Textarea
          rows={3}
          placeholder="Briefly describe what your company does, its mission, and the kind of staff you are looking for."
          value={form.description}
          onChange={(e) => set('description')(e.target.value)}
        />
      </FormField>
      {error && <p className="text-danger text-sm sm:col-span-2">{error}</p>}
      <div className="border-border flex justify-end border-t pt-4 sm:col-span-2">
        <Button type="submit" loading={pending} disabled={!isReady} rightIcon={<ArrowRight />}>
          Save and continue
        </Button>
      </div>
    </form>
  );
}

// ─── Contacts step ──────────────────────────────────────────────────────

interface ContactForm {
  name: string;
  designation: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

const emptyContact = (): ContactForm => ({
  name: '',
  designation: '',
  phone: '',
  email: '',
  isPrimary: false,
});

function ContactsStep({
  company,
  onSaved,
}: {
  company: CompanyView;
  onSaved: (c: CompanyView) => void;
}) {
  const [items, setItems] = useState<ContactForm[]>(
    company.contacts.length > 0
      ? company.contacts.map((c) => ({
          name: c.name,
          designation: c.designation ?? '',
          phone: c.phone,
          email: c.email ?? '',
          isPrimary: c.isPrimary,
        }))
      : [{ ...emptyContact(), isPrimary: true }],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, key: keyof ContactForm, value: string | boolean) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return key === 'isPrimary' && value ? { ...item, isPrimary: false } : item;
        return { ...item, [key]: value };
      }),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data: saved } = await apiFetch<CompanyView>('/api/v1/companies/me/contacts', {
        method: 'PUT',
        body: {
          items: items.map((c) => ({
            name: c.name,
            designation: c.designation || undefined,
            phone: c.phone,
            email: c.email || undefined,
            isPrimary: c.isPrimary,
          })),
        },
      });
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const primaryCount = items.filter((i) => i.isPrimary).length;
  const isReady =
    items.length > 0 &&
    items.every((i) => i.name.trim().length >= 3 && i.phone.trim().length >= 10) &&
    primaryCount === 1;

  return (
    <form className="grid gap-6" onSubmit={(e) => void save(e)}>
      <p className="text-fg-muted text-sm">
        Add the people Job Bank can contact about your company. Mark one as the main contact.
      </p>
      {items.map((item, idx) => (
        <div key={idx} className="border-border grid gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <span className="text-fg text-sm font-medium">Contact {idx + 1}</span>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="primary"
                  checked={item.isPrimary}
                  onChange={() => updateItem(idx, 'isPrimary', true)}
                />
                Main contact
              </label>
              {items.length > 1 && (
                <button
                  type="button"
                  className="text-danger text-xs underline"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Full name" required>
              <Input
                placeholder="e.g. Ahmed Khan"
                value={item.name}
                onChange={(e) => updateItem(idx, 'name', e.target.value)}
              />
            </FormField>
            <FormField label="Designation">
              <Input
                placeholder="e.g. HR Manager"
                value={item.designation}
                onChange={(e) => updateItem(idx, 'designation', e.target.value)}
              />
            </FormField>
            <FormField label="Phone" required>
              <Input
                type="tel"
                placeholder="0300 1234567"
                value={item.phone}
                onChange={(e) => updateItem(idx, 'phone', e.target.value)}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                placeholder="contact@company.com"
                value={item.email}
                onChange={(e) => updateItem(idx, 'email', e.target.value)}
              />
            </FormField>
          </div>
        </div>
      ))}
      {items.length < 5 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setItems((prev) => [...prev, emptyContact()])}
        >
          Add another contact
        </Button>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button
        type="submit"
        fullWidth
        loading={pending}
        disabled={!isReady}
        rightIcon={<ArrowRight />}
      >
        Save and continue
      </Button>
    </form>
  );
}

// ─── Location step ──────────────────────────────────────────────────────

interface GeoResult {
  lat: number;
  lng: number;
  addressLine: string;
  cityCode: string | null;
  cityLabel: string | null;
  display: string;
}

// The wizard used to call OpenCage directly from the browser, which needs
// NEXT_PUBLIC_OPENCAGE_API_KEY — that key is empty, so search always
// returned [] , no suggestion could ever be picked, lat/lng stayed 0 and
// the Save button could never enable. Use the server endpoint instead:
// GET /api/v1/geocode/search falls back Photon -> Nominatim with no key,
// exactly like StaffCompanyPanel and MapPinPicker already do.
async function searchAddress(query: string): Promise<GeoResult[]> {
  const { data } = await apiFetch<GeoResult[]>(
    `/api/v1/geocode/search?q=${encodeURIComponent(query)}`,
  );
  return data ?? [];
}

/** "Rahim Yar Khan" -> "RAHIM_YAR_KHAN", matching the seeded CITY codes. A
 * plain toUpperCase() leaves spaces in, which masterDataCodeSchema rejects. */
function toCityCode(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Approximate city centres for the seeded CITY list. Used only when the
 * server geocode lookup returns nothing or is unreachable (the laptop
 * network has blocked external geocoders before), so Save still works:
 * the exact address text is saved and the pin is the city centre, near
 * enough for the nearest-branch lookup. Never a substitute for a real
 * geocode result when one is available. */
const CITY_CENTRES: Record<string, { lat: number; lng: number }> = {
  KARACHI: { lat: 24.8607, lng: 67.0011 },
  LAHORE: { lat: 31.5204, lng: 74.3587 },
  ISLAMABAD: { lat: 33.6844, lng: 73.0479 },
  RAWALPINDI: { lat: 33.6007, lng: 73.0679 },
  FAISALABAD: { lat: 31.4504, lng: 73.135 },
  MULTAN: { lat: 30.1575, lng: 71.5249 },
  HYDERABAD: { lat: 25.396, lng: 68.3578 },
  GUJRANWALA: { lat: 32.1877, lng: 74.1945 },
  PESHAWAR: { lat: 34.0151, lng: 71.5249 },
  QUETTA: { lat: 30.1798, lng: 66.975 },
  SIALKOT: { lat: 32.4945, lng: 74.5229 },
  SARGODHA: { lat: 32.0837, lng: 72.6711 },
  BAHAWALPUR: { lat: 29.3544, lng: 71.6911 },
  SUKKUR: { lat: 27.7052, lng: 68.8574 },
  LARKANA: { lat: 27.5589, lng: 68.212 },
  ABBOTTABAD: { lat: 34.1688, lng: 73.2215 },
  MARDAN: { lat: 34.1986, lng: 72.0231 },
  GUJRAT: { lat: 32.5731, lng: 74.1005 },
  SHEIKHUPURA: { lat: 31.7166, lng: 73.985 },
  RAHIM_YAR_KHAN: { lat: 28.4202, lng: 70.2989 },
  MUZAFFARABAD: { lat: 34.37, lng: 73.471 },
  GILGIT: { lat: 35.8819, lng: 74.4645 },
};

function LocationStep({
  company,
  onSaved,
}: {
  company: CompanyView;
  onSaved: (c: CompanyView) => void;
}) {
  const hq = company.headOffice;
  const [lat, setLat] = useState(hq?.location.lat ?? 0);
  const [lng, setLng] = useState(hq?.location.lng ?? 0);
  const [addressLine, setAddressLine] = useState(hq?.addressLine ?? '');
  const [city, setCity] = useState(hq?.cityCode ?? '');
  const [cityCode, setCityCode] = useState(hq?.cityCode ?? '');
  const [area, setArea] = useState(hq?.areaCode ?? '');
  const [branchId, setBranchId] = useState(company.branch?.id ?? '');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(hq?.addressLine ?? '');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nearest branches for a pin; returns the list so save() can use it
  // immediately instead of waiting on state.
  async function loadBranches(
    pinLat: number,
    pinLng: number,
  ): Promise<{ id: string; name: string }[]> {
    const { data } = await apiFetch<{ id: string; name: string }[]>(
      `/api/v1/companies/me/branch-options?lat=${pinLat}&lng=${pinLng}`,
    );
    const list = data ?? [];
    setBranches(list);
    if (!branchId && list.length > 0) setBranchId(list[0]!.id);
    return list;
  }

  useEffect(() => {
    if (!lat || !lng) return;
    loadBranches(lat, lng).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  function onSearchChange(value: string) {
    setSearchQuery(value);
    setSearchNote(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchAddress(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        if (results.length === 0) {
          setSearchNote(
            'No matching address found — pick a nearby area or landmark, or type the full address below and save.',
          );
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchNote(
          'Address search is unavailable right now — type the full address below and save, it will be located then.',
        );
      } finally {
        setSearching(false);
      }
    }, 500);
  }

  function pickSuggestion(r: GeoResult) {
    setLat(r.lat);
    setLng(r.lng);
    setAddressLine(r.display || r.addressLine);
    setSearchQuery(r.display || r.addressLine);
    // Server result carries the real master-data city code; the old code
    // stored the raw label as city and never set an area code the backend
    // accepts, so a picked suggestion could still fail on save.
    if (r.cityCode) {
      setCityCode(r.cityCode);
      setCity(r.cityLabel ?? r.cityCode);
    } else if (r.cityLabel) {
      setCity(r.cityLabel);
      setCityCode('');
    }
    setSearchNote(null);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      // Fallback for a manually typed address: coordinates only ever came
      // from picking a suggestion, so typing the address + city (as in the
      // reported screenshot) could never enable the button. Locate the
      // typed address on save instead of leaving the user stuck.
      let useLat = lat;
      let useLng = lng;
      let useCityCode = cityCode || toCityCode(city);
      let useBranchId = branchId;
      if (useLat === 0 || useLng === 0) {
        const query = [addressLine.trim(), city.trim()].filter(Boolean).join(', ');
        let first: GeoResult | null = null;
        try {
          const results = await searchAddress(query || searchQuery.trim());
          first = results[0] ?? null;
        } catch {
          first = null;
        }
        if (first) {
          useLat = first.lat;
          useLng = first.lng;
          setLat(first.lat);
          setLng(first.lng);
          if (first.cityCode) {
            useCityCode = first.cityCode;
            setCityCode(first.cityCode);
            setCity(first.cityLabel ?? first.cityCode);
          }
        } else {
          // Geocode returned nothing or is unreachable — fall back to the
          // typed city's centre instead of leaving the user stuck again
          // with an error. Only unknown cities still error out.
          const centre = CITY_CENTRES[useCityCode];
          if (!centre) {
            throw new Error(
              "Couldn't locate this address. Pick one of the search suggestions, or try a nearby area or landmark.",
            );
          }
          useLat = centre.lat;
          useLng = centre.lng;
          setLat(centre.lat);
          setLng(centre.lng);
        }
      }
      if (!useBranchId) {
        const options = await loadBranches(useLat, useLng);
        if (options.length === 0) {
          throw new Error('No Job Bank branch was found near this address.');
        }
        useBranchId = options[0]!.id;
        setBranchId(useBranchId);
      }
      // Area is a free-text input ("DHA Phase 5"), but the backend expects
      // a master-data AREA code — sending the typed text 422s the whole
      // save (assertCityArea). Only send it when it already looks like a
      // code (e.g. a stored KARACHI_GULSHAN_E_IQBAL left untouched); the
      // typed area still lives in the saved address line.
      const areaCodeToSend =
        area.trim() && /^[A-Z0-9_]+$/.test(area.trim().toUpperCase())
          ? area.trim().toUpperCase()
          : undefined;
      const { data: saved } = await apiFetch<CompanyView>('/api/v1/companies/me/head-office', {
        method: 'PUT',
        body: {
          location: { lat: useLat, lng: useLng },
          addressLine,
          cityCode: useCityCode,
          areaCode: areaCodeToSend,
          branchId: useBranchId,
        },
      });
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  const hasCoords = lat !== 0 && lng !== 0;
  // Address + city is enough to enable the button; save() locates the
  // typed address when no pin was picked yet. Requiring coords + branch
  // up front is what deadlocked the step.
  const isReady = addressLine.trim().length >= 5 && city.trim().length >= 2;

  return (
    <form className="grid gap-4" onSubmit={(e) => void save(e)}>
      <p className="text-fg-muted text-sm">
        Search for your head office address. Job Bank will suggest the nearest branch automatically.
      </p>

      {/* Address search */}
      <div className="relative">
        {/* Not "required": this is only a search box — the saved address is
            "Full address" below. As a required input it blocked native form
            submission whenever it was empty, so an enabled Save button did
            nothing on click. */}
        <FormField label="Search address">
          <Input
            placeholder="Type your office address, e.g. DHA Phase 5, Karachi"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          />
        </FormField>
        {searching && <p className="text-fg-muted mt-1 text-xs">Searching…</p>}
        {!searching && searchNote && <p className="text-fg-muted mt-1 text-xs">{searchNote}</p>}
        {showSuggestions && (
          <ul className="border-border bg-surface absolute top-full z-10 mt-1 w-full overflow-hidden rounded-xl border shadow-lg">
            {suggestions.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="hover:bg-surface-muted w-full px-4 py-2.5 text-left text-sm"
                  onMouseDown={() => pickSuggestion(r)}
                >
                  {r.display || r.addressLine}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasCoords && (
        <p className="text-fg-muted text-xs">
          Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      )}

      <FormField label="Full address" required>
        <Input
          placeholder="Building name, street, area"
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="City" required>
          <Input
            placeholder="e.g. Karachi"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              // Typed city, not a picked suggestion — drop the old code so
              // save() resolves the city from what is typed now.
              setCityCode('');
            }}
          />
        </FormField>
        <FormField label="Area">
          <Input
            placeholder="e.g. DHA Phase 5"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </FormField>
      </div>

      {branches.length > 0 && (
        <FormField label="Nearest Job Bank branch" required>
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </FormField>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      {!hasCoords && isReady && (
        <p className="text-fg-muted text-xs">
          No suggestion picked — we&apos;ll locate this address when you save.
        </p>
      )}
      <Button
        type="submit"
        fullWidth
        loading={pending}
        disabled={!isReady}
        rightIcon={<ArrowRight />}
      >
        Save and continue
      </Button>
    </form>
  );
}

// ─── Documents step ─────────────────────────────────────────────────────

/** What each side of the authorised person's CNIC needs (migration 0040). */
const DOCUMENT_HINTS: Record<string, string> = {
  AUTHORISED_PERSON_CNIC_FRONT: 'Upload a clear photo of the front of the CNIC.',
  AUTHORISED_PERSON_CNIC_BACK: 'Upload a clear photo of the back of the CNIC.',
};

function DocumentsStep({
  company,
  onSaved,
}: {
  company: CompanyView;
  onSaved: (c: CompanyView) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company_, setCompany_] = useState(company);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  function previewFile(typeCode: string, file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result)
        setPreviews((p) => ({ ...p, [typeCode]: ev.target!.result as string }));
    };
    reader.readAsDataURL(file);
  }

  // The file name is never checked: phone photos are usually named
  // IMG_1234.jpg, and the old CNIC name check ("cnic|id|nic|identity")
  // rejected those outright, so CNIC uploads failed while NTN/SECP went
  // through. Only size and type are checked; the server enforces the same
  // rules from the document type's own meta on presign.
  function validateDocument(typeCode: string, file: File): string | null {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) return 'File is too large. Maximum size is 5 MB.';
    if (typeCode.startsWith('AUTHORISED_PERSON_CNIC')) {
      // CNIC front/back are photos, like the applicant-side CNIC_FRONT /
      // CNIC_BACK types: JPG or PNG only, no PDF.
      if (!['image/jpeg', 'image/png'].includes(file.type))
        return 'Upload a JPG or PNG photo of the CNIC.';
      return null;
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) return 'Only JPG, PNG, or PDF files are accepted.';
    return null;
  }

  async function upload(typeCode: string, file: File) {
    setUploading(typeCode);
    setError(null);
    try {
      const { data: presign } = await apiFetch<{
        documentId: string;
        upload: { url: string; fields: Record<string, string> };
      }>('/api/v1/companies/me/documents', {
        method: 'POST',
        body: { typeCode, fileName: file.name, contentType: file.type, sizeBytes: file.size },
      });

      const r = await fetch(presign.upload.url, { method: 'PUT', body: file });
      if (!r.ok) throw new Error('Upload to storage failed');

      const { data: saved } = await apiFetch<CompanyView>(
        `/api/v1/companies/me/documents/${presign.documentId}/confirm`,
        { method: 'POST' },
      );
      setCompany_(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-fg-muted text-sm">
        Upload the required documents. Accepted formats: PDF, JPG or PNG, up to 5 MB each.
      </p>
      {company_.requiredDocuments.length === 0 && (
        <p className="text-fg-muted text-sm">
          No documents required for your business type yet. Continue to submit.
        </p>
      )}
      {company_.requiredDocuments.map((code) => {
        const uploaded = company_.documents.find(
          (d) => d.typeCode === code && d.reviewStatus !== 'REJECTED',
        );
        const hint = DOCUMENT_HINTS[code];
        return (
          <div key={code} className="border-border grid gap-2 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-fg text-sm font-medium">{code.replace(/_/g, ' ')}</span>
              {uploaded ? (
                <Badge tone="success">Uploaded</Badge>
              ) : (
                <Badge tone="neutral">Required</Badge>
              )}
            </div>
            {hint && <p className="text-fg-muted text-xs">{hint}</p>}
            {uploaded && (
              <p className="text-fg-muted text-xs">
                {uploaded.fileName}
                {uploaded.reviewStatus === 'ACCEPTED' && ' · Accepted by verifier'}
              </p>
            )}
            {previews[code] && (
              <img
                src={previews[code]}
                alt={`Preview of ${code.replace(/_/g, ' ')}`}
                className="mt-1 h-20 w-auto rounded-lg object-cover"
              />
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept={
                  code.startsWith('AUTHORISED_PERSON_CNIC')
                    ? '.jpg,.jpeg,.png'
                    : '.pdf,.jpg,.jpeg,.png'
                }
                className="sr-only"
                disabled={uploading === code}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const problem = validateDocument(code, file);
                  if (problem) {
                    setError(problem);
                    return;
                  }
                  setError(null);
                  previewFile(code, file);
                  void upload(code, file);
                }}
              />
              <span className="text-accent text-sm underline underline-offset-4">
                {uploading === code ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
              </span>
            </label>
          </div>
        );
      })}
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button
        onClick={() => onSaved(company_)}
        fullWidth
        rightIcon={<ArrowRight />}
        disabled={!!uploading}
      >
        Continue
      </Button>
    </div>
  );
}

// ─── Submit step ────────────────────────────────────────────────────────

function SubmitStep({
  company,
  onSubmitted,
  idempotencyKey,
}: {
  company: CompanyView;
  onSubmitted: (c: CompanyView) => void;
  idempotencyKey: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const pill = STATUS_PILL[company.status];

  const canSubmit = company.status === 'DRAFT' || company.status === 'REJECTED';
  const canResubmit = company.status === 'INFO_REQUESTED';

  // M18: sending back needs a note saying what changed, or a document uploaded
  // after the verifier's request — otherwise an unchanged company would bounce
  // back and burn a fresh SLA.
  const infoRequestedAt = company.verification?.infoRequestedAt ?? null;
  const hasNewDocument =
    !!infoRequestedAt &&
    company.documents.some((d) => !!d.uploadedAt && d.uploadedAt > infoRequestedAt);
  const canSendBack = isResubmitNoteSufficient(note) || hasNewDocument;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const { data: saved } = await apiFetch<CompanyView>('/api/v1/companies/me/submit', {
        method: 'POST',
        idempotencyKey,
      });
      onSubmitted(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function resubmit() {
    setPending(true);
    setError(null);
    try {
      const { data: saved } = await apiFetch<CompanyView>('/api/v1/companies/me/resubmit', {
        method: 'POST',
        body: { note: note.trim() || null },
      });
      onSubmitted(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="border-border bg-surface grid gap-3 rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-fg font-semibold">{company.details.legalName}</h3>
          <StatusPill label={pill.label} tone={pill.variant} />
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-fg-muted w-32 shrink-0">NTN</dt>
            <dd className="text-fg">{company.details.ntn}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-fg-muted w-32 shrink-0">Branch</dt>
            <dd className="text-fg">{company.branch?.name ?? 'Not set'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-fg-muted w-32 shrink-0">Contacts</dt>
            <dd className="text-fg">{company.contacts.length}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-fg-muted w-32 shrink-0">Documents</dt>
            <dd className="text-fg">{company.documents.length} uploaded</dd>
          </div>
        </dl>
        {company.missing.length > 0 && (
          <div className="bg-warning-soft text-warning-soft-fg grid gap-1 rounded-lg p-3 text-sm">
            <p className="font-medium">Still missing:</p>
            <ul className="grid list-disc gap-0.5 pl-4">
              {company.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {company.status === 'INFO_REQUESTED' && company.verification?.infoRequest && (
        <div className="bg-warning-soft text-warning-soft-fg grid gap-1 rounded-xl px-5 py-4 text-sm">
          <p className="font-semibold">The verifier requested more information:</p>
          <p>{company.verification.infoRequest}</p>
        </div>
      )}

      {canResubmit && (
        <FormField
          label="What did you change or send?"
          hint={
            hasNewDocument
              ? 'A document you uploaded after the request is attached — you can send it back now, or add a note as well.'
              : `Write at least ${RESUBMIT_NOTE_MIN_LENGTH} characters so the verifier knows what changed.`
          }
        >
          <Textarea
            rows={3}
            placeholder="e.g. Uploaded the renewed NTN certificate and corrected the head office address."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      {canSubmit && (
        <Button
          fullWidth
          loading={pending}
          disabled={company.missing.length > 0}
          leftIcon={<Send />}
          onClick={() => void submit()}
        >
          Submit for verification
        </Button>
      )}
      {canResubmit && (
        <Button
          fullWidth
          loading={pending}
          disabled={!canSendBack}
          leftIcon={<Send />}
          onClick={() => void resubmit()}
        >
          Send back to verifier
        </Button>
      )}
      {!canSubmit && !canResubmit && (
        <div className="border-border bg-surface-muted text-fg-muted rounded-xl border p-5 text-center text-sm">
          Your company has been submitted. You will be notified by email when the verifier makes a
          decision.
        </div>
      )}
    </div>
  );
}

// ─── Main wizard ────────────────────────────────────────────────────────

export function CompanyWizard({
  initialStep,
  initialCompany,
}: {
  initialStep: string;
  initialCompany: CompanyView | null;
}) {
  const router = useRouter();
  const registerKey = useRef(crypto.randomUUID());
  const submitKey = useRef(crypto.randomUUID());
  const [company, setCompany] = useState<CompanyView | null>(initialCompany);
  const [currentStep, setCurrentStep] = useState<WizardStep>(() => {
    const valid = STEPS.map((s) => s.id);
    return valid.includes(initialStep as WizardStep) ? (initialStep as WizardStep) : 'details';
  });

  function goTo(step: WizardStep) {
    setCurrentStep(step);
    router.replace(`/employer/company?step=${step}`, { scroll: false });
  }

  function saved(c: CompanyView) {
    setCompany(c);
    const next = nextStep(currentStep);
    if (next) goTo(next);
  }

  const currentIdx = stepIndex(currentStep);
  const activeStep = STEPS[currentIdx]!;
  const progress = Math.round(((currentIdx + 1) / STEPS.length) * 100);

  return (
    <div className="grid w-full gap-4 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-fg text-2xl font-semibold">Register your company</h1>
          <p className="text-fg-muted text-sm">
            Complete your company profile to start hiring through Job Bank.
          </p>
        </div>
        {company && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-muted max-w-56 truncate text-sm">
              {company.details.legalName}
            </span>
            <StatusPill
              label={STATUS_PILL[company.status].label}
              tone={STATUS_PILL[company.status].variant}
            />
          </div>
        )}
      </header>

      <section aria-label="Company registration progress" className="grid gap-3">
        <div
          aria-label={`${progress}% complete`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="bg-surface-muted h-1 overflow-hidden rounded-full"
          role="progressbar"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <nav aria-label="Registration steps" className="flex gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, idx) => {
            const isCurrent = s.id === currentStep;
            const isComplete = idx < currentIdx && company;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => company && goTo(s.id)}
                disabled={!company && idx > 0}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
                  isCurrent ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface-muted',
                ].join(' ')}
              >
                {isComplete ? (
                  <CheckCircle2 className="text-success size-5 shrink-0" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold"
                  >
                    {idx + 1}
                  </span>
                )}
                <span className="font-medium">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </section>

      <section className="border-border bg-surface grid gap-5 rounded-xl border p-4 sm:p-6">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-fg text-lg font-semibold">{activeStep.title}</h2>
            <span className="text-fg-muted text-xs">
              Step {currentIdx + 1} of {STEPS.length}
            </span>
          </div>
          <p className="text-fg-muted text-sm">{activeStep.description}</p>
        </div>
        {currentStep === 'details' && (
          <DetailsStep company={company} onSaved={saved} idempotencyKey={registerKey.current} />
        )}
        {currentStep === 'contacts' && company && (
          <ContactsStep company={company} onSaved={saved} />
        )}
        {currentStep === 'location' && company && (
          <LocationStep company={company} onSaved={saved} />
        )}
        {currentStep === 'documents' && company && (
          <DocumentsStep company={company} onSaved={saved} />
        )}
        {currentStep === 'submit' && company && (
          <SubmitStep
            company={company}
            idempotencyKey={submitKey.current}
            onSubmitted={(c) => {
              setCompany(c);
            }}
          />
        )}
        {!company && currentStep !== 'details' && (
          <p className="text-fg-muted text-center text-sm">Complete company details first.</p>
        )}
      </section>

      {prevStep(currentStep) && company && (
        <button
          type="button"
          onClick={() => goTo(prevStep(currentStep)!)}
          className="text-fg-muted hover:text-fg focus-visible:focus-ring flex w-fit items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      )}
    </div>
  );
}
