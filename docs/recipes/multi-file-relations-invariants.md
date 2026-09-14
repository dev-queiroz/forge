# Recipe: Multi-File Relations And Invariants

Use imports when a contract references another file. Forge resolves imports semantically; a type must be local or explicitly imported.

## `customer.forge`

```forge
namespace commerce

contract Customer {
  id: uuid @primary @default(uuid())
  email: string @unique

  invariant email != ""
}
```

## `product.forge`

```forge
namespace commerce

contract Product {
  sku: string @primary
  name: string
  price: decimal
  stock: int

  invariant name != ""
  invariant price > 0 && stock >= 0
  invariant price * stock > 100
}
```

## `order.forge`

```forge
import Customer from "./customer.forge"
import Product from "./product.forge"

namespace commerce

contract Order {
  id: uuid @primary @default(uuid())
  customerId: uuid
  customer: Customer @foreign(customerId)
  productSku: string
  product: Product @foreign(productSku)
  quantity: int @default(1)
  total: decimal

  invariant quantity > 0
  invariant total > 0
}
```

## Commands

```bash
forge check
forge compile --target prisma,openapi,nest
forge diff
```

The Prisma generator emits deterministic relation names. If only one side of the relation is declared, `forge doctor` warns about the unilateral relation and the Prisma generator still emits the back-reference required by Prisma.
