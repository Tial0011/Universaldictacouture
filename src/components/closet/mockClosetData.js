import piece1 from "../../assets/images/samples/piece-1.jpg";
import piece2 from "../../assets/images/samples/piece-2.jpg";
import piece3 from "../../assets/images/samples/piece-3.jpg";
import piece4 from "../../assets/images/samples/piece-4.jpg";
import piece5 from "../../assets/images/samples/piece-5.jpg";
import piece6 from "../../assets/images/samples/piece-6.jpg";

export const MOCK_CLOSET_PIECES = [
  {
    id: "piece-burgundy",
    productId: "sample-1",
    name: "Royal Burgundy Aso Oke Fabric",
    price: 95000,
    meta: "Traditional weave · per bundle",
    image: piece1,
    completedOrders: 2,
    available: true,
  },
  {
    id: "piece-champagne",
    productId: "sample-2",
    name: "Champagne Elegance Aso Oke",
    price: 120000,
    meta: "Fine weave · per set",
    image: piece2,
    completedOrders: 0,
    available: true,
  },
  {
    id: "piece-blush",
    productId: "sample-3",
    name: "Blush Heritage Aso Oke Fabric",
    price: 95000,
    meta: "Classic weave · per bundle",
    image: piece3,
    completedOrders: 1,
    available: true,
  },
  {
    id: "piece-emerald",
    productId: "sample-4",
    name: "Emerald Grace Aso Oke Fabric",
    price: 130000,
    meta: "Premium weave · per set",
    image: piece4,
    completedOrders: 0,
    available: false,
  },
  {
    id: "piece-indigo",
    productId: "sample-5",
    name: "Indigo Heritage Weave",
    price: 110000,
    meta: "Signature weave · per bundle",
    image: piece5,
    completedOrders: 1,
    available: true,
  },
  {
    id: "piece-ivory",
    productId: "sample-6",
    name: "Ivory Royal Aso Oke Fabric",
    price: 100000,
    meta: "Classic weave · per bundle",
    image: piece6,
    completedOrders: 0,
    available: true,
  },
];

export const MOCK_ORDERS = [
  {
    id: "udc-2048",
    title: "Auntie Kemi's Wedding",
    orderNumber: "UDC-2048",
    status: "Needs Your Review",
    tone: "attention",
    summary: "Royal Burgundy Aso Oke Fabric · Fabric & Sew",
    updated: "Today · 10:32 AM",
    currentEdition: "Edition 3",
    total: 250000,
    image: piece1,
    editions: [
      { id: "e3", label: "Edition 3", state: "Current · Awaiting Customer Review", actor: "Dicta Couturier", time: "Today · 10:26 AM" },
      { id: "e2", label: "Edition 2", state: "Historical · Read only", actor: "Customer", time: "Yesterday · 4:18 PM" },
      { id: "e1", label: "Edition 1", state: "Historical · Read only", actor: "System", time: "14 Sep · 10:24 AM" },
    ],
    activity: [
      { label: "Order Card edited", meta: "Dicta Couturier · Today, 10:26 AM" },
      { label: "Couturier approval recorded", meta: "Today, 10:28 AM" },
      { label: "Customer review requested", meta: "Today, 10:30 AM" },
      { label: "Order created", meta: "14 Sep, 10:24 AM" },
    ],
  },
  {
    id: "udc-2031",
    title: "Brother Bolu's Birthday",
    orderNumber: "UDC-2031",
    status: "Completed",
    tone: "complete",
    summary: "Indigo Heritage Weave · Fabric Only",
    updated: "18 Sep · 5:14 PM",
    currentEdition: "Edition 2",
    total: 220000,
    image: piece5,
    editions: [
      { id: "e2", label: "Edition 2", state: "Paid historical Edition", actor: "Dicta Couturier", time: "16 Sep · 9:02 AM" },
      { id: "e1", label: "Edition 1", state: "Historical · Read only", actor: "Customer", time: "15 Sep · 2:44 PM" },
    ],
    activity: [
      { label: "Order Completed", meta: "Authorized Couturier · 18 Sep, 5:14 PM" },
      { label: "Payment Verified", meta: "17 Sep, 11:08 AM" },
      { label: "Customer Final Approval", meta: "16 Sep, 9:14 AM" },
      { label: "Order created", meta: "15 Sep, 2:32 PM" },
    ],
  },
  {
    id: "udc-2026",
    title: "UDC-2026",
    orderNumber: "UDC-2026",
    status: "Payment Completed",
    tone: "paid",
    summary: "Blush Heritage Aso Oke Fabric · Fabric Only",
    updated: "10 Sep · 12:45 PM",
    currentEdition: "Edition 1",
    total: 190000,
    image: piece3,
    editions: [
      { id: "e1", label: "Edition 1", state: "Paid historical Edition", actor: "Customer + Couturier", time: "7 Sep · 1:16 PM" },
    ],
    activity: [
      { label: "Payment Completed", meta: "10 Sep, 12:45 PM" },
      { label: "Payment Verified", meta: "10 Sep, 12:44 PM" },
      { label: "Order created", meta: "7 Sep, 12:58 PM" },
    ],
  },
];

export const MOCK_PAYMENTS = [
  {
    id: "pay-2048",
    orderId: "udc-2048",
    title: "Auntie Kemi's Wedding",
    orderNumber: "UDC-2048",
    image: piece1,
    amountDueNow: 100000,
    totalPaid: 150000,
    outstanding: 100000,
    records: [
      { id: "p2", label: "Payment 2", amount: 50000, state: "Under Review", time: "Today · 9:42 AM" },
      { id: "p1", label: "Payment 1", amount: 150000, state: "Verified", time: "18 Sep · 2:16 PM" },
    ],
  },
  {
    id: "pay-2031",
    orderId: "udc-2031",
    title: "Brother Bolu's Birthday",
    orderNumber: "UDC-2031",
    image: piece5,
    amountDueNow: 0,
    totalPaid: 220000,
    outstanding: 0,
    records: [
      { id: "p1", label: "Payment 1", amount: 220000, state: "Verified", time: "17 Sep · 11:08 AM" },
    ],
  },
];
