// The project both sides start from: the workbooks as read before any edit.
export const base = () => ({
  projectId: 1,
  positionTypes: [{ PositionTypeRef: 'P1', Name: 'Downlight' }],
  dbCollectionRefs: ['ET-A', 'ET-B'],
  elementTypes: [
    { ElementTypeRef: 'ET-A-01', Name: 'A one', Description: 'Alpha', Family: 'ET-A', _row_num: 2 },
    { ElementTypeRef: 'ET-A-02', Name: 'A two', Description: 'Alpha 2', Family: 'ET-A', _row_num: 3 },
    { ElementTypeRef: 'ET-B-01', Name: 'B one', Description: 'Beta', Family: 'ET-B', _row_num: 4 },
  ],
  psRows: [
    { _id: 'p1', ElementTypeRef: 'ET-A-01', Manufacturer: 'Acme', ProductCode: 'A1', ComponentDescription: 'Alpha', _row_num: 2 },
    { _id: 'p2', ElementTypeRef: 'ET-A-02', Manufacturer: 'Acme', ProductCode: 'A2', ComponentDescription: 'Alpha 2', _row_num: 3 },
    { _id: 'p3', ElementTypeRef: 'ET-B-01', Manufacturer: 'Bco', ProductCode: 'B1', ComponentDescription: 'Beta', _row_num: 4 },
  ],
  recipes: [
    { _id: 'r1', ContextType: 'PositionType', ContextRef: 'P1', PositionTypeRef: 'P1', RecipeIndex: 1, ElementTypeRef: 'ET-A-01', Quantity: 1, IsDesign: 'Y', _row_num: 2 },
    { _id: 'r2', ContextType: 'PositionType', ContextRef: 'P1', PositionTypeRef: 'P1', RecipeIndex: 2, ElementTypeRef: 'ET-A-02', Quantity: 2, IsContractItem: 'Y', _row_num: 3 },
  ],
  psChanges: [], rsChanges: [], dbChanges: [], past: [], future: [], dbWriteEnabled: true,
})
