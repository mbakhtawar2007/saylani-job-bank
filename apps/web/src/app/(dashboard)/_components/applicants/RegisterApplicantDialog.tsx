'use client';

import {
  GENDER_LABELS,
  GENDERS,
  JOB_TYPE_LABELS,
  JOB_TYPES,
  MIN_APPLICANT_AGE,
  SHIFT_LABELS,
  SHIFTS,
  staffRegisterApplicantSchema,
  type Gender,
} from '@jobbank/shared';
import { UserRoundPlus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, RadioGroup, Select, Textarea } from '@/components/atoms';
import type { SelectOption } from '@/components/atoms';
import { CNICInput, FormField, Modal, PhoneInput } from '@/components/molecules';
import { MapPinPicker, type LatLng } from '@/components/organisms';
import type { ApplicantStaffView } from '@/domains/applicant';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { errorMessage, toFieldErrors, zodFieldErrors, type FieldErrors } from './form';
import { RegistrationFormPrint } from './RegistrationFormPrint';

interface MasterDataOption {
  id: string;
  code: string;
  label: string;
  parentId: string | null;
}

interface EducationForm {
  levelCode: string;
  institution: string;
  fieldOfStudy: string;
  completionYear: string;
  grade: string;
  isCurrent: boolean;
}

interface ExperienceForm {
  employerName: string;
  jobTitle: string;
  categoryCode: string;
  startMonth: string;
  endMonth: string;
  description: string;
  isCurrent: boolean;
}

interface CertificationForm {
  name: string;
  issuer: string;
  issuedMonth: string;
  expiresMonth: string;
}

const emptyEducation = (): EducationForm => ({
  levelCode: '',
  institution: '',
  fieldOfStudy: '',
  completionYear: '',
  grade: '',
  isCurrent: false,
});
const emptyExperience = (): ExperienceForm => ({
  employerName: '',
  jobTitle: '',
  categoryCode: '',
  startMonth: '',
  endMonth: '',
  description: '',
  isCurrent: false,
});
const emptyCertification = (): CertificationForm => ({
  name: '',
  issuer: '',
  issuedMonth: '',
  expiresMonth: '',
});

const latestBirthDate = () => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - MIN_APPLICANT_AGE);
  return date.toISOString().slice(0, 10);
};

interface Props {
  branches: SelectOption[];
  placement?: 'default' | 'sidebar';
}

function toggle<T>(values: T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}

export function RegisterApplicantDialog({ branches, placement = 'default' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [applicant, setApplicant] = useState<ApplicantStaffView | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const [verifiedSigned, setVerifiedSigned] = useState(false);
  const [markingSigned, setMarkingSigned] = useState(false);
  const [cities, setCities] = useState<MasterDataOption[]>([]);
  const [areas, setAreas] = useState<MasterDataOption[]>([]);
  const [educationLevels, setEducationLevels] = useState<MasterDataOption[]>([]);
  const [jobCategories, setJobCategories] = useState<MasterDataOption[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    fatherName: '',
    cnic: '',
    dateOfBirth: '',
    gender: '' as Gender | '',
    email: '',
    phone: '',
    branchId: branches.length === 1 ? branches[0]!.value : '',
  });
  const [address, setAddress] = useState({ addressLine: '', cityCode: '', areaCode: '' });
  const [location, setLocation] = useState<LatLng | null>(null);
  const [sameAddress, setSameAddress] = useState(false);
  const [permanentAddress, setPermanentAddress] = useState({
    addressLine: '',
    cityCode: '',
    areaCode: '',
  });
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [education, setEducation] = useState<EducationForm[]>([emptyEducation()]);
  const [experience, setExperience] = useState<ExperienceForm[]>([emptyExperience()]);
  const [hasNoExperience, setHasNoExperience] = useState(false);
  const [skills, setSkills] = useState<
    { skillCode: string; level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT'; years: string }[]
  >([{ skillCode: '', level: 'BEGINNER', years: '0' }]);
  const [certifications, setCertifications] = useState<CertificationForm[]>([emptyCertification()]);
  const [categoryCodes, setCategoryCodes] = useState<string[]>([]);
  const [shifts, setShifts] = useState<(typeof SHIFTS)[number][]>([]);
  const [jobTypes, setJobTypes] = useState<(typeof JOB_TYPES)[number][]>([]);
  const [preference, setPreference] = useState({
    minSalaryPkr: '',
    willingRadiusM: '',
    availableFrom: '',
  });

  const updateForm = (changes: Partial<typeof form>) =>
    setForm((current) => ({ ...current, ...changes }));

  const updatePermanentAddress = (changes: Partial<typeof permanentAddress>) => {
    setPermanentAddress((current) => ({ ...current, ...changes }));
    if (sameAddress) setAddress((current) => ({ ...current, ...changes }));
  };

  useEffect(() => {
    setPrintReady(true);
  }, []);

  useEffect(() => {
    if (!open || cities.length > 0) return;
    let active = true;
    setLoadingOptions(true);
    setAlert(null);
    Promise.all(
      ['CITY', 'AREA', 'EDUCATION_LEVEL', 'JOB_CATEGORY'].map((type) =>
        apiFetch<MasterDataOption[]>(`/api/v1/master-data?type=${type}`).then(({ data }) => data),
      ),
    )
      .then(([cityOptions, areaOptions, levels, categories]) => {
        if (!active) return;
        setCities(cityOptions ?? []);
        setAreas(areaOptions ?? []);
        setEducationLevels(levels ?? []);
        setJobCategories(categories ?? []);
      })
      .catch((error: unknown) => {
        if (active) setAlert(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [open, cities.length]);

  const setDialogOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setApplicant(null);
      setVerifiedSigned(false);
      setErrors({});
      setAlert(null);
      updateForm({
        fullName: '',
        fatherName: '',
        cnic: '',
        dateOfBirth: '',
        gender: '',
        email: '',
        phone: '',
        branchId: branches.length === 1 ? branches[0]!.value : '',
      });
      setAddress({ addressLine: '', cityCode: '', areaCode: '' });
      setLocation(null);
      setSameAddress(false);
      setPermanentAddress({ addressLine: '', cityCode: '', areaCode: '' });
      setAdditionalNotes('');
      setEducation([emptyEducation()]);
      setExperience([emptyExperience()]);
      setHasNoExperience(false);
      setSkills([{ skillCode: '', level: 'BEGINNER', years: '0' }]);
      setCertifications([emptyCertification()]);
      setCategoryCodes([]);
      setShifts([]);
      setJobTypes([]);
      setPreference({ minSalaryPkr: '', willingRadiusM: '', availableFrom: '' });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAlert(null);

    const educationItems = education.filter((item) =>
      Object.entries(item).some(([key, value]) => (key === 'isCurrent' ? value : value !== '')),
    );
    const experienceItems = experience.filter((item) =>
      Object.entries(item).some(([key, value]) => (key === 'isCurrent' ? value : value !== '')),
    );
    const skillItems = skills.filter((item) => item.skillCode.trim());
    const certificationItems = certifications.filter((item) => item.name.trim());
    const hasAddress = Boolean(
      address.addressLine || address.cityCode || address.areaCode || location,
    );
    const hasPermanentAddress = Boolean(
      permanentAddress.addressLine || permanentAddress.cityCode || permanentAddress.areaCode,
    );
    const hasPreferences = Boolean(
      categoryCodes.length ||
      shifts.length ||
      jobTypes.length ||
      preference.minSalaryPkr ||
      preference.willingRadiusM ||
      preference.availableFrom,
    );
    const payload = {
      ...form,
      ...(hasAddress ? { address: { ...address, location: location ?? undefined } } : {}),
      ...(hasPermanentAddress ? { permanentAddress } : {}),
      additionalNotes,
      education: {
        items: educationItems.map((item) => ({
          ...item,
          completionYear: item.completionYear ? Number(item.completionYear) : null,
        })),
      },
      experience: {
        hasNoExperience,
        items: hasNoExperience ? [] : experienceItems,
      },
      skills: {
        items: skillItems.map((item) => ({ ...item, years: Number(item.years) || 0 })),
      },
      certifications: {
        items: certificationItems.map((item) => ({
          ...item,
          issuedMonth: item.issuedMonth || null,
          expiresMonth: item.expiresMonth || null,
        })),
      },
      ...(hasPreferences
        ? {
            preferences: {
              categoryCodes,
              shifts,
              jobTypes,
              minSalaryPkr: preference.minSalaryPkr ? Number(preference.minSalaryPkr) : null,
              willingRadiusM: preference.willingRadiusM ? Number(preference.willingRadiusM) : null,
              availableFrom: preference.availableFrom || null,
            },
          }
        : {}),
    };
    const parsed = staffRegisterApplicantSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data } = await apiFetch<ApplicantStaffView>('/api/v1/applicants', {
        method: 'POST',
        body: parsed.data,
      });
      setApplicant(data);
      setVerifiedSigned(Boolean(data.registrationVerifiedSignedAt));
      setOpen(false);
      router.replace(pathname);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.issues.length > 0) {
        setErrors(toFieldErrors(error.issues));
      } else {
        setAlert(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  };

  const markAsVerifiedSigned = async () => {
    if (!applicant) return;
    setMarkingSigned(true);
    setAlert(null);
    try {
      const { data } = await apiFetch<{
        verifiedSigned: boolean;
        verifiedSignedAt: string;
        verifiedSignedBy: string;
      }>(`/api/v1/applicants/${applicant.id}/registration-form/verified-signed`, {
        method: 'POST',
      });
      setApplicant((current) =>
        current
          ? {
              ...current,
              registrationVerifiedSignedAt: data.verifiedSignedAt,
              registrationVerifiedSignedBy: data.verifiedSignedBy,
            }
          : current,
      );
      setVerifiedSigned(true);
      router.refresh();
    } catch (error) {
      setAlert(errorMessage(error));
    } finally {
      setMarkingSigned(false);
    }
  };

  const selectedCity = cities.find((city) => city.code === address.cityCode);
  const cityAreas = areas.filter((area) => area.parentId === selectedCity?.id);
  const selectedPermanentCity = cities.find((city) => city.code === permanentAddress.cityCode);
  const permanentCityAreas = areas.filter((area) => area.parentId === selectedPermanentCity?.id);
  const educationOptions = educationLevels.map((item) => ({ value: item.code, label: item.label }));
  const categoryOptions = jobCategories.map((item) => ({ value: item.code, label: item.label }));
  const printForm =
    applicant && printReady
      ? createPortal(
          <RegistrationFormPrint profile={applicant} branchName={applicant.branch?.name ?? ''} />,
          document.body,
        )
      : null;

  return (
    <>
      <Modal
        title="Register applicant"
        description="Complete the applicant's first-counter profile, then review and print it for verification and signature."
        open={open}
        onOpenChange={setDialogOpen}
        size="lg"
        trigger={
          <Button
            fullWidth={placement === 'sidebar'}
            leftIcon={placement === 'sidebar' ? <UserRoundPlus aria-hidden="true" /> : undefined}
          >
            Register Applicant
          </Button>
        }
      >
        <form className="grid gap-5" onSubmit={submit} noValidate>
          {alert && (
            <p
              role="alert"
              className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
            >
              {alert}
            </p>
          )}
          {loadingOptions && <p className="text-fg-muted text-sm">Loading profile options…</p>}
          {branches.length > 1 && (
            <FormField label="Branch" required error={errors.branchId}>
              <Select
                value={form.branchId}
                onChange={(event) => updateForm({ branchId: event.target.value })}
                placeholder="Choose a branch"
                options={branches}
              />
            </FormField>
          )}

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">1. Basic personal information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Full name" required error={errors.fullName}>
                <Input
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => updateForm({ fullName: e.target.value })}
                  onBlur={() => {
                    const result = staffRegisterApplicantSchema.shape.fullName.safeParse(
                      form.fullName,
                    );
                    setErrors((current) => {
                      const next = { ...current };
                      if (result.success) {
                        delete next.fullName;
                      } else {
                        next.fullName =
                          result.error.issues[0]?.message ?? 'Enter a valid full name';
                      }
                      return next;
                    });
                  }}
                />
              </FormField>
              <FormField label="Father's or husband's name" required error={errors.fatherName}>
                <Input
                  value={form.fatherName}
                  onChange={(e) => updateForm({ fatherName: e.target.value })}
                />
              </FormField>
              <FormField label="CNIC number" required error={errors.cnic}>
                <CNICInput
                  value={form.cnic}
                  onChange={(cnic) => updateForm({ cnic: cnic.digits })}
                />
              </FormField>
              <FormField
                label="Date of birth"
                required
                error={errors.dateOfBirth}
                hint={`The applicant must be at least ${MIN_APPLICANT_AGE}.`}
              >
                <Input
                  type="date"
                  max={latestBirthDate()}
                  min="1940-01-01"
                  value={form.dateOfBirth}
                  onChange={(e) => updateForm({ dateOfBirth: e.target.value })}
                />
              </FormField>
              <FormField label="Gender" required error={errors.gender} className="sm:col-span-2">
                <RadioGroup
                  aria-label="Gender"
                  orientation="horizontal"
                  value={form.gender}
                  onValueChange={(value) => updateForm({ gender: value as Gender })}
                  options={GENDERS.map((gender) => ({
                    value: gender,
                    label: GENDER_LABELS[gender],
                  }))}
                />
              </FormField>
              <FormField label="Mobile number" required error={errors.phone}>
                <PhoneInput
                  aria-label="Mobile number"
                  value={form.phone}
                  onChange={(value) => updateForm({ phone: value.e164 ?? value.national })}
                />
              </FormField>
              <FormField label="Email" error={errors.email}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => updateForm({ email: e.target.value })}
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">2. Educational background</h2>
            {education.map((item, index) => (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" key={index}>
                <FormField
                  label="Education level / qualification"
                  error={errors[`education.items.${index}.levelCode`]}
                >
                  <Select
                    value={item.levelCode}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, levelCode: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Choose a level"
                    options={educationOptions}
                  />
                </FormField>
                <FormField label="Field of study">
                  <Input
                    value={item.fieldOfStudy}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, fieldOfStudy: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Institution">
                  <Input
                    value={item.institution}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, institution: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Completion year">
                  <Input
                    type="number"
                    min={1950}
                    max={new Date().getUTCFullYear() + 6}
                    value={item.completionYear}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, completionYear: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Grade / marks">
                  <Input
                    value={item.grade}
                    onChange={(e) =>
                      setEducation((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, grade: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <Checkbox
                  label="Currently studying"
                  checked={item.isCurrent}
                  onCheckedChange={(checked) =>
                    setEducation((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, isCurrent: checked === true } : row,
                      ),
                    )
                  }
                />
                {education.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEducation((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove qualification
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEducation((rows) => [...rows, emptyEducation()])}
            >
              Add qualification
            </Button>
            <h3 className="font-medium">Certifications</h3>
            {certifications.map((item, index) => (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" key={index}>
                <FormField label="Certification name">
                  <Input
                    value={item.name}
                    onChange={(e) =>
                      setCertifications((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, name: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Issuing organization">
                  <Input
                    value={item.issuer}
                    onChange={(e) =>
                      setCertifications((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, issuer: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Issued month">
                  <Input
                    type="month"
                    value={item.issuedMonth}
                    onChange={(e) =>
                      setCertifications((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, issuedMonth: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Expiry month">
                  <Input
                    type="month"
                    value={item.expiresMonth}
                    onChange={(e) =>
                      setCertifications((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, expiresMonth: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                {certifications.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCertifications((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove certification
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCertifications((rows) => [...rows, emptyCertification()])}
            >
              Add certification
            </Button>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">3. Work experience and skills</h2>
            <Checkbox
              label="No previous work experience"
              checked={hasNoExperience}
              onCheckedChange={(checked) => setHasNoExperience(checked === true)}
            />
            {!hasNoExperience &&
              experience.map((item, index) => (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" key={index}>
                  <FormField label="Employer / organization">
                    <Input
                      value={item.employerName}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, employerName: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Job title / role">
                    <Input
                      value={item.jobTitle}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, jobTitle: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Work category">
                    <Select
                      value={item.categoryCode}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, categoryCode: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Optional"
                      options={categoryOptions}
                    />
                  </FormField>
                  <FormField label="Start month">
                    <Input
                      type="month"
                      value={item.startMonth}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, startMonth: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="End month">
                    <Input
                      type="month"
                      value={item.endMonth}
                      disabled={item.isCurrent}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, endMonth: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <Checkbox
                    label="Currently employed"
                    checked={item.isCurrent}
                    onCheckedChange={(checked) =>
                      setExperience((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, isCurrent: checked === true, endMonth: '' } : row,
                        ),
                      )
                    }
                  />
                  <FormField label="Duties / professional background" className="sm:col-span-2">
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        setExperience((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, description: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  {experience.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setExperience((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Remove employment
                    </Button>
                  )}
                </div>
              ))}
            {!hasNoExperience && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExperience((rows) => [...rows, emptyExperience()])}
              >
                Add employment history
              </Button>
            )}
            <h3 className="font-medium">Skills</h3>
            {skills.map((item, index) => (
              <div className="grid gap-3 sm:grid-cols-3" key={index}>
                <FormField label="Skill">
                  <Input
                    value={item.skillCode}
                    onChange={(e) =>
                      setSkills((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, skillCode: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField label="Skill level">
                  <Select
                    value={item.level}
                    onChange={(e) =>
                      setSkills((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, level: e.target.value as typeof row.level } : row,
                        ),
                      )
                    }
                    options={[
                      { value: 'BEGINNER', label: 'Beginner' },
                      { value: 'INTERMEDIATE', label: 'Intermediate' },
                      { value: 'EXPERT', label: 'Expert' },
                    ]}
                  />
                </FormField>
                <FormField label="Years of experience">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={item.years}
                    onChange={(e) =>
                      setSkills((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, years: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </FormField>
                {skills.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSkills((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Remove skill
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setSkills((rows) => [...rows, { skillCode: '', level: 'BEGINNER', years: '0' }])
              }
            >
              Add skill
            </Button>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">
              4. Work availability and preferences
            </h2>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">Preferred work categories / roles</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {jobCategories.map((item) => (
                  <Checkbox
                    key={item.code}
                    label={item.label}
                    checked={categoryCodes.includes(item.code)}
                    onCheckedChange={(checked) =>
                      setCategoryCodes((values) => toggle(values, item.code, checked === true))
                    }
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">Preferred shifts</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {SHIFTS.map((shift) => (
                  <Checkbox
                    key={shift}
                    label={SHIFT_LABELS[shift]}
                    checked={shifts.includes(shift)}
                    onCheckedChange={(checked) =>
                      setShifts((values) => toggle(values, shift, checked === true))
                    }
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">Suitable job types</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {JOB_TYPES.map((jobType) => (
                  <Checkbox
                    key={jobType}
                    label={JOB_TYPE_LABELS[jobType]}
                    checked={jobTypes.includes(jobType)}
                    onCheckedChange={(checked) =>
                      setJobTypes((values) => toggle(values, jobType, checked === true))
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Minimum monthly salary (PKR)">
                <Input
                  type="number"
                  min={0}
                  value={preference.minSalaryPkr}
                  onChange={(e) =>
                    setPreference((current) => ({ ...current, minSalaryPkr: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Travel distance (meters)">
                <Input
                  type="number"
                  min={1000}
                  max={10000}
                  step={1000}
                  value={preference.willingRadiusM}
                  onChange={(e) =>
                    setPreference((current) => ({ ...current, willingRadiusM: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Available from">
                <Input
                  type="date"
                  value={preference.availableFrom}
                  onChange={(e) =>
                    setPreference((current) => ({ ...current, availableFrom: e.target.value }))
                  }
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">5. Residential information</h2>
            <Checkbox
              label="Current Address is Same as Permanent Address"
              description="Current address fields will follow the permanent address while checked."
              checked={sameAddress}
              onCheckedChange={(checked) => {
                const isSame = checked === true;
                setSameAddress(isSame);
                if (isSame) {
                  setAddress(permanentAddress);
                  setLocation(null);
                }
              }}
            />
            <FormField label="Current residential address">
              <Input
                autoComplete="street-address"
                value={address.addressLine}
                onChange={(e) =>
                  setAddress((current) => ({ ...current, addressLine: e.target.value }))
                }
                disabled={sameAddress}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="City">
                <Select
                  value={address.cityCode}
                  onChange={(e) =>
                    setAddress((current) => ({
                      ...current,
                      cityCode: e.target.value,
                      areaCode: '',
                    }))
                  }
                  placeholder="Choose a city"
                  options={cities.map((city) => ({ value: city.code, label: city.label }))}
                  disabled={sameAddress}
                />
              </FormField>
              <FormField label="Area of residence">
                <Select
                  value={address.areaCode}
                  onChange={(e) =>
                    setAddress((current) => ({ ...current, areaCode: e.target.value }))
                  }
                  placeholder="Choose an area"
                  options={cityAreas.map((area) => ({ value: area.code, label: area.label }))}
                  disabled={sameAddress}
                />
              </FormField>
            </div>
            {Boolean(address.addressLine || address.cityCode || address.areaCode || location) && (
              <>
                <p className="text-sm font-medium">Current home location on map</p>
                <MapPinPicker
                  value={location}
                  onChange={setLocation}
                  label="Applicant's home location"
                  height="14rem"
                />
                {errors['address.location'] && (
                  <p role="alert" className="text-danger text-sm">
                    {errors['address.location']}
                  </p>
                )}
              </>
            )}
            <p className="text-sm font-medium">Permanent address</p>
            <FormField label="Permanent address" error={errors['permanentAddress.addressLine']}>
              <Input
                autoComplete="street-address"
                value={permanentAddress.addressLine}
                onChange={(event) => updatePermanentAddress({ addressLine: event.target.value })}
                placeholder="House, street, block"
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Permanent city" error={errors['permanentAddress.cityCode']}>
                <Select
                  value={permanentAddress.cityCode}
                  onChange={(event) =>
                    updatePermanentAddress({ cityCode: event.target.value, areaCode: '' })
                  }
                  options={cities.map((city) => ({ value: city.code, label: city.label }))}
                  placeholder="Choose a city"
                />
              </FormField>
              <FormField label="Permanent area" error={errors['permanentAddress.areaCode']}>
                <Select
                  value={permanentAddress.areaCode}
                  onChange={(event) => updatePermanentAddress({ areaCode: event.target.value })}
                  options={permanentCityAreas.map((area) => ({
                    value: area.code,
                    label: area.label,
                  }))}
                  placeholder="Choose an area"
                  disabled={!selectedPermanentCity}
                />
              </FormField>
            </div>
          </section>

          <section className="grid gap-3">
            <h2 className="text-fg border-b pb-2 font-semibold">
              6. Additional relevant information
            </h2>
            <FormField label="Additional notes" error={errors.additionalNotes}>
              <Textarea
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                rows={4}
                placeholder="Anything else that helps assess the applicant's suitability"
              />
            </FormField>
          </section>

          {branches.length === 0 && (
            <p role="alert" className="text-danger text-sm">
              No branch is available for this account.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={branches.length === 0 || loadingOptions}
            >
              Save draft and review
            </Button>
          </div>
        </form>
      </Modal>

      {applicant && (
        <section className="registration-review-screen bg-surface fixed inset-0 z-[100] overflow-y-auto p-4 sm:p-8">
          <div className="mx-auto grid max-w-4xl gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <h1 className="text-fg text-2xl font-bold">Review &amp; Print</h1>
                <p className="text-fg-muted mt-1 text-sm">
                  Review the saved draft with the applicant. Print the complete form, have it
                  signed, then mark it verified and signed.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => window.print()}>Print form</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setApplicant(null);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </div>
            </header>
            {alert && (
              <p
                role="alert"
                className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm"
              >
                {alert}
              </p>
            )}
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">{applicant.personal.fullName}</h2>
              <p className="text-fg-muted text-sm">Draft · Applicant reference {applicant.id}</p>
            </div>
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Registration form preview</h2>
              <p className="text-fg-muted mt-1 text-sm">
                The print version contains all six sections, a QR code for the applicant reference,
                and the applicant and staff signature fields.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void markAsVerifiedSigned()}
                loading={markingSigned}
                disabled={verifiedSigned}
              >
                {verifiedSigned ? 'Verified & signed' : 'Mark as verified & signed'}
              </Button>
              {verifiedSigned && (
                <p role="status" className="text-success text-sm">
                  Verification and signature recorded. The applicant remains in DRAFT status.
                </p>
              )}
            </div>
          </div>
        </section>
      )}
      {printForm}
    </>
  );
}
