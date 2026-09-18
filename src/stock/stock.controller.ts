import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/auth.guard';
import {
  ConfirmInboundDto,
  CreateInboundDto,
  InboundIdDto,
  UpdateInboundDto,
} from './dto/stock-inbound.dto';
import {
  ConfirmOutboundDto,
  CreateOutboundDto,
  OutboundIdDto,
  UpdateOutboundDto,
} from './dto/stock-outbound.dto';
import {
  ProductNoDto,
  ShelfNameDto,
  TransferDto,
} from './dto/stock-transfer.dto';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @HttpCode(HttpStatus.OK)
  @Post('shelves/list')
  listShelves() {
    return this.stockService.listShelves();
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/list')
  listLocations() {
    return this.stockService.listProductLocations();
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/by-product')
  locationsByProduct(@Body() dto: ProductNoDto) {
    return this.stockService.locationsByProduct(dto.productNo);
  }

  @HttpCode(HttpStatus.OK)
  @Post('locations/by-shelf')
  locationsByShelf(@Body() dto: ShelfNameDto) {
    return this.stockService.locationsByShelf(dto.shelfName);
  }

  @HttpCode(HttpStatus.OK)
  @Post('transfers')
  transfer(@Body() dto: TransferDto) {
    return this.stockService.transfer(dto);
  }

  @Post('inbounds')
  create(@Request() req: RequestWithUser, @Body() dto: CreateInboundDto) {
    return this.stockService.create(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/list')
  list(@Request() req: RequestWithUser) {
    return this.stockService.findMine(req.user.sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/update')
  update(@Request() req: RequestWithUser, @Body() dto: UpdateInboundDto) {
    return this.stockService.updateDraft(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/confirm')
  confirm(@Request() req: RequestWithUser, @Body() dto: ConfirmInboundDto) {
    return this.stockService.confirm(req.user.sub, req.user.username, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/void')
  voidDraft(@Request() req: RequestWithUser, @Body() dto: InboundIdDto) {
    return this.stockService.voidDraft(req.user.sub, dto.id);
  }

  @Post('outbounds')
  createOutbound(
    @Request() req: RequestWithUser,
    @Body() dto: CreateOutboundDto,
  ) {
    return this.stockService.createOutbound(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/list')
  listOutbounds(@Request() req: RequestWithUser) {
    return this.stockService.findMyOutbounds(req.user.sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/update')
  updateOutbound(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateOutboundDto,
  ) {
    return this.stockService.updateOutboundDraft(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/confirm')
  confirmOutbound(
    @Request() req: RequestWithUser,
    @Body() dto: ConfirmOutboundDto,
  ) {
    return this.stockService.confirmOutbound(
      req.user.sub,
      req.user.username,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/void')
  voidOutbound(@Request() req: RequestWithUser, @Body() dto: OutboundIdDto) {
    return this.stockService.voidOutboundDraft(req.user.sub, dto.id);
  }
}
