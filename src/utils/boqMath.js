const num = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const materialBudget = (item) =>
    item?.mTotal !== undefined && item?.mTotal !== null
        ? num(item.mTotal)
        : num(item?.q) * num(item?.mP);

export const laborBudget = (item) =>
    item?.lTotal !== undefined && item?.lTotal !== null
        ? num(item.lTotal)
        : num(item?.q) * num(item?.lP);

export const itemBudget = (item) => materialBudget(item) + laborBudget(item);
