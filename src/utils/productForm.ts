export type ProductDraft = {
	id: string;
	name: string;
	sku: string;
	status: string;
	location: string;
	qty: string;
	min: string;
	price: string;
	barcode: string;
	image: string;
};

export const canSaveProduct = (
	mode: 'create' | 'edit',
	draft: ProductDraft | null,
	dirty: boolean,
	saving: boolean,
	hasTenant: boolean,
): boolean => {
	if (!draft || saving || !hasTenant) return false;
	if (mode === 'create') return Boolean(draft.sku.trim() && draft.name.trim());
	return dirty;
};
