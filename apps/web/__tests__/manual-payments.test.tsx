// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminTransactionItem, PaymentStatus } from '@bongah/shared-types';

const post = vi.fn();
const upload = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const listMutate = vi.fn(async () => undefined);
const swrMutate = vi.fn(async () => undefined);
let paymentData: PaymentStatus | undefined;
let me: { role: string } | undefined;
let adminList: { data: unknown[]; meta: { total: number; total_pages: number } } | undefined;
const adminArgs = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));
vi.mock('swr', () => ({
  default: () => ({ data: paymentData, error: undefined }),
  mutate: (...a: unknown[]) => swrMutate(...(a as [])),
}));
vi.mock('@/lib/image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/image')>('@/lib/image');
  return { ...actual, fitImage: async (f: File) => f };
});
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, post: (...a: unknown[]) => post(...a), upload: (...a: unknown[]) => upload(...a) } };
});
vi.mock('@/hooks/use-api', () => ({
  useMe: () => ({ data: me, error: undefined }),
  useAdminPayments: (opts: unknown) => {
    adminArgs(opts);
    return { data: adminList, error: undefined, mutate: listMutate };
  },
}));

import { ApiError } from '@/lib/api';
import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { closeManualPayment, openManualPayment } from '@/lib/manual-payment';
import { ManualPaymentDialog } from '@/components/subscription/manual-payment-dialog';
import { PaymentsReview } from '@/components/admin/payments-review';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);
const wrap = (node: React.ReactNode) => render(<LanguageProvider initialLanguage="prs">{node}</LanguageProvider>);

const status = (over: Partial<PaymentStatus> = {}): PaymentStatus =>
  ({
    id: 'pay-1',
    purpose: 'SUBSCRIPTION',
    status: 'PENDING',
    amount: 1500,
    currency: 'AFGHANI',
    created_at: '2026-10-28T08:00:00Z',
    paid_at: null,
    receipt_number: null,
    package_type: 'MONTHLY',
    quantity: null,
    property_title: null,
    method: 'MANUAL',
    receipt_uploaded: false,
    manual: {
      accounts: [
        { kind: 'HESABPAY', number: '0700 000 000', holder: 'Test Holder', bank: null },
        { kind: 'CARD', number: '1234 5678 9012 3456', holder: 'Test Holder', bank: 'Test Bank' },
      ],
      note: 'test-note',
    },
    ...over,
  }) as PaymentStatus;

const item = (over: Partial<AdminTransactionItem> = {}): AdminTransactionItem =>
  ({
    ...status({ receipt_uploaded: true }),
    hesabpay_tx_id: 'tx',
    user: { id: 'u', full_name: 'Ali', phone_number: '+93700000001', banned_at: null },
    agency_name: 'Ali Realty',
    proof_uploaded_at: '2026-10-28T09:00:00Z',
    reference_submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    force_activated: false,
    ...over,
  }) as AdminTransactionItem;

beforeEach(() => {
  for (const fn of [post, upload, toastSuccess, toastError, listMutate, swrMutate, adminArgs]) fn.mockClear();
  paymentData = undefined;
  me = { role: 'ADMIN' };
  adminList = undefined;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
});
afterEach(() => {
  act(() => closeManualPayment());
  cleanup();
  vi.unstubAllGlobals();
});

describe('the pay-by-hand dialog', () => {
  it('shows the amount and the accounts the API sent, and no link to leave the panel', () => {
    paymentData = status();
    wrap(<ManualPaymentDialog />);
    act(() => openManualPayment('pay-1'));
    expect(screen.getByTestId('manual-amount').textContent).toContain('۱٬۵۰۰');
    expect(screen.getByTestId('manual-accounts').textContent).toContain('0700 000 000');
    expect(screen.getByTestId('manual-accounts').textContent).toContain('1234 5678 9012 3456');
    expect(screen.getByText('test-note')).toBeTruthy();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });

  it('sends nothing until a picture is chosen, then uploads that file as the receipt', async () => {
    paymentData = status();
    upload.mockResolvedValue(status({ receipt_uploaded: true }));
    wrap(<ManualPaymentDialog />);
    act(() => openManualPayment('pay-1'));
    expect(screen.queryByTestId('manual-send')).toBeNull();

    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('manual-file'), { target: { files: [file] } });
    fireEvent.click(await screen.findByTestId('manual-send'));

    await waitFor(() => expect(upload).toHaveBeenCalledWith('hesabpay/payments/pay-1/proof', file));
  });

  it('refuses a file that is not a picture without sending it', () => {
    paymentData = status();
    wrap(<ManualPaymentDialog />);
    act(() => openManualPayment('pay-1'));
    const pdf = new File(['x'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByTestId('manual-file'), { target: { files: [pdf] } });
    expect(screen.getByRole('alert').textContent).toBe(t('pm.receipt.badType'));
    expect(screen.queryByTestId('manual-send')).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('says the receipt is on its way to review once it is on file', () => {
    paymentData = status({ receipt_uploaded: true });
    wrap(<ManualPaymentDialog />);
    act(() => openManualPayment('pay-1'));
    expect(screen.getByText(t('pm.receipt.sentTitle'))).toBeTruthy();
  });

  describe('the transaction reference', () => {
    const typeReference = (value: string) => fireEvent.change(screen.getByTestId('manual-reference'), { target: { value } });

    it('is offered next to the picture, and sends it cleaned up (Persian digits become 0-9)', async () => {
      paymentData = status();
      post.mockResolvedValue(status({ reference: 'HP20261029001' }));
      wrap(<ManualPaymentDialog />);
      act(() => openManualPayment('pay-1'));
      typeReference('  HP۲۰۲۶۱۰۲۹۰۰۱ ');
      fireEvent.click(screen.getByTestId('manual-reference-send'));
      await waitFor(() => expect(post).toHaveBeenCalledWith('hesabpay/payments/pay-1/reference', { reference: 'HP20261029001' }));
      expect(upload).not.toHaveBeenCalled();
    });

    it('does not send something that cannot be a transaction id, and says what to write', () => {
      paymentData = status();
      wrap(<ManualPaymentDialog />);
      act(() => openManualPayment('pay-1'));
      for (const bad of ['ab1', '<b>HP12345</b>', '--12345--']) {
        typeReference(bad);
        fireEvent.click(screen.getByTestId('manual-reference-send'));
        expect(screen.getByTestId('manual-reference-problem').textContent).toBe(t('pm.ref.invalid'));
      }
      expect(post).not.toHaveBeenCalled();
    });

    it('says plainly when the same reference is already on another payment', async () => {
      paymentData = status();
      post.mockRejectedValue(new ApiError(409, { code: 'REFERENCE_ALREADY_USED', message: 'x' }));
      wrap(<ManualPaymentDialog />);
      act(() => openManualPayment('pay-1'));
      typeReference('HP20261029001');
      fireEvent.click(screen.getByTestId('manual-reference-send'));
      expect((await screen.findByTestId('manual-reference-problem')).textContent).toBe(t('err.code.REFERENCE_ALREADY_USED'));
    });

    it('counts as proof on its own: the dialog shows it received, with the number, and keeps the picture option open', () => {
      paymentData = status({ reference: 'HP20261029001' });
      wrap(<ManualPaymentDialog />);
      act(() => openManualPayment('pay-1'));
      expect(screen.getByText(t('pm.ref.sentTitle'))).toBeTruthy();
      expect(screen.getByTestId('manual-reference-saved').textContent).toBe('HP20261029001');
      expect(screen.queryByTestId('manual-reference-box')).toBeNull();
      expect(screen.getByText(t('pm.receipt.choose'))).toBeTruthy();
    });
  });

  it('shows the admin’s reason when the payment was refused', () => {
    paymentData = status({ status: 'FAILED', review_note: 'blurry' });
    wrap(<ManualPaymentDialog />);
    act(() => openManualPayment('pay-1'));
    expect(screen.getByRole('status').textContent).toBe(t('pm.rejected', { reason: 'blurry' }));
    expect(screen.queryByTestId('manual-accounts')).toBeNull();
  });
});

describe('the admin payments screen', () => {
  const open = async (p: AdminTransactionItem) => {
    adminList = { data: [p], meta: { total: 1, total_pages: 1 } };
    wrap(<PaymentsReview />);
    fireEvent.click(screen.getByTestId('admin-pay-review'));
    await screen.findByTestId('admin-pay-approve');
  };

  it('is for admins only', () => {
    me = { role: 'AGENCY' };
    wrap(<PaymentsReview />);
    expect(screen.getByTestId('admin-only').textContent).toContain(t('adm.pay.notAdmin'));
    expect(screen.queryByTestId('admin-pay-table')).toBeNull();
  });

  it('asks for the waiting payments first, and for the manual ones on the other tab', () => {
    adminList = { data: [], meta: { total: 0, total_pages: 1 } };
    wrap(<PaymentsReview />);
    expect(adminArgs).toHaveBeenLastCalledWith({ waiting: true, q: '', page: 1 });
    expect(screen.getByText(t('adm.pay.empty'))).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(t('adm.pay.tab.all')) }), { button: 0 });
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(t('adm.pay.tab.all')) }));
    expect(adminArgs).toHaveBeenLastCalledWith({ waiting: false, q: '', page: 1 });
  });

  it('shows the receipt picture from the panel’s own proxy and approves it with no reason needed', async () => {
    post.mockResolvedValue({});
    await open(item());
    const img = screen.getByTestId('admin-pay-image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(`/api/bongah/admin/transactions/pay-1/proof?v=${encodeURIComponent('2026-10-28T09:00:00Z')}`);
    fireEvent.click(screen.getByTestId('admin-pay-approve'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/transactions/pay-1/approve', {}));
    await waitFor(() => expect(listMutate).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalledWith(t('adm.pay.approved'));
  });

  it('approves on a transaction reference alone, shows it to compare with the account, and names the button for VIP on a subscription', async () => {
    post.mockResolvedValue({});
    await open(item({ receipt_uploaded: false, proof_uploaded_at: null, reference: 'HP-4242-AB', reference_submitted_at: '2026-10-28T09:00:00Z' }));
    expect(screen.getByTestId('admin-pay-reference').textContent).toBe('HP-4242-AB');
    expect(screen.getByText(t('adm.pay.referenceHint'))).toBeTruthy();
    const approve = screen.getByTestId('admin-pay-approve') as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect(approve.textContent).toBe(t('adm.pay.approveVip'));
    fireEvent.click(approve);
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/transactions/pay-1/approve', {}));
  });

  it('keeps the plain wording on the approve button for what is not a subscription', async () => {
    await open(item({ purpose: 'LADDER' }));
    expect(screen.getByTestId('admin-pay-approve').textContent).toBe(t('adm.pay.approve'));
  });

  it('cannot approve without a picture, but can force-activate with a reason of three letters or more', async () => {
    post.mockResolvedValue({});
    await open(item({ receipt_uploaded: false, proof_uploaded_at: null }));
    expect((screen.getByTestId('admin-pay-approve') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('admin-pay-image')).toBeNull();
    expect(screen.getByText(t('adm.pay.noImage'))).toBeTruthy();

    fireEvent.click(screen.getByTestId('admin-pay-force'));
    const confirm = screen.getByTestId('admin-pay-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('admin-pay-reason'), { target: { value: 'ab' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('admin-pay-reason'), { target: { value: 'paid in cash' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/transactions/pay-1/force-activate', { reason: 'paid in cash' }));
    expect(post).not.toHaveBeenCalledWith('admin/transactions/pay-1/approve', expect.anything());
  });

  it('rejects with a reason the customer will see', async () => {
    post.mockResolvedValue({});
    await open(item());
    fireEvent.click(screen.getByTestId('admin-pay-reject'));
    fireEvent.change(screen.getByTestId('admin-pay-reason'), { target: { value: 'wrong amount' } });
    fireEvent.click(screen.getByTestId('admin-pay-confirm'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('admin/transactions/pay-1/reject', { reason: 'wrong amount' }));
  });

  it('refreshes the list when somebody else decided first, and says why it failed', async () => {
    post.mockRejectedValue(new ApiError(409, { code: 'PAYMENT_NOT_PENDING', message: 'x' }));
    await open(item());
    fireEvent.click(screen.getByTestId('admin-pay-approve'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(t('err.code.PAYMENT_NOT_PENDING')));
    expect(listMutate).toHaveBeenCalled();
  });

  it('falls back to a message when the picture cannot be loaded', async () => {
    await open(item());
    fireEvent.error(screen.getByTestId('admin-pay-image'));
    expect(await screen.findByText(t('adm.pay.loadFailed'))).toBeTruthy();
  });
});
